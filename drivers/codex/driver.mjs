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
  if (failed) {
    if (results[0].status === 'fulfilled') {
      await results[0].value.cancel().catch(() => {});
      await results[0].value.delete().catch(() => {});
    }
    return { ok: false, error: String(failed.reason) };
  }
  const download = results[0].value;
  let timer, stream;
  try {
    return await Promise.race([
      (async () => {
        const failure = await download.failure();
        if (failure) throw new Error(failure);
        stream = await download.createReadStream();
        if (!stream) throw new Error('The browser did not provide the downloaded file.');
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        return { ok: true, filename: download.suggestedFilename(), bytes: Buffer.concat(chunks) };
      })(),
      new Promise((_,reject) => { timer=setTimeout(()=>reject(new Error('The downloaded file did not finish in time.')),timeout); })
    ]);
  } catch (error) { return { ok: false, error: String(error) }; }
  finally {
    clearTimeout(timer); stream?.destroy();
    await download.cancel().catch(() => {});
    await download.delete().catch(() => {});
  }
}
