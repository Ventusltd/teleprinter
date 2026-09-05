/** Playwright host: capture current compositor pixels in memory, never a screenshot file. */
export async function attachScreenCapture(page, { onCapture } = {}) {
  await page.exposeBinding('__codexTeleprinterCapture', async ({ frame }) => {
    if (frame !== page.mainFrame()) throw new Error('Only the main page can print this screen.');
    const png = await page.screenshot({ type: 'png', fullPage: false, scale: 'device' });
    onCapture?.(png);
    return png.toString('base64');
  });
}

/** Every rejection is observed immediately, including when clicking fails first. */
export async function clickAndReadDownload(page, locator, { timeout = 15000 } = {}) {
  const downloadPromise = page.waitForEvent('download', { timeout });
  const results = await Promise.allSettled([downloadPromise, locator.click({ timeout })]);
  const failed = results.find(result => result.status === 'rejected');
  if (failed) return { ok: false, error: String(failed.reason) };
  const download = results[0].value;
  try {
    const failure = await download.failure();
    if (failure) throw new Error(failure);
    const stream = await download.createReadStream();
    if (!stream) throw new Error('The browser did not provide the downloaded file.');
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return { ok: true, filename: download.suggestedFilename(), bytes: Buffer.concat(chunks) };
  } catch (error) { return { ok: false, error: String(error) }; }
  finally { await download.delete().catch(() => {}); }
}
