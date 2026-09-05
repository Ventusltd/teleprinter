# Native capture requirement remains blocked

Target: generation202609051531. Condition: `native-full-resolution-capture`.
Committed engine97ef804 fullSHA `97ef8043a3f29ec162932838b44b2d6163845727`; exact LF Git blob SHA256
`5bd8dcaf97266ab87bfd2b7fe3ca39ba49c8b2f98e0018bbc7ea268336eec68b`. Final report engine SHA256 `8d84cf39d0506a795e66fcc989764981368bc5eb8d59433f6615442cd7f1abbb` differs, including after testing CRLF conversion.
No exact-current-engine failing run is claimed. Parent explicitly targets the
new candidate pending fresh passing native proof.

Final bounded report: zero passes, one completed Atlas failure, two incomplete
cases. Required1365?900 and track1365?900 produced frame1364?898; the guard
visibly refused it and did not create a reduced PDF. That protects fidelity
but does not make native printing succeed. Earlier different-engine report:
one of three passed (Pipeline1200?800), two Atlas failures. Its saved PDF SHA
was independently checked. Original reports and artifacts stay offline and
are hashed by the registry. Browser route was generation1517 with temporary
engine overrides; mobile means desktop Chrome emulation, not a real device.

`CODEX-NATIVE-001` applies to1531 and the exact committed shared engine hash.
Its required native condition is never emitted by the host-screenshot gate,
so host50 cannot clear it. No engines, browser or gate changed in this review.

## Later exact served-byte check

The published1531 engine was subsequently read from all three actual Chrome
module responses: SHA256 5bd8dcaf97266ab87bfd2b7fe3ca39ba49c8b2f98e0018bbc7ea268336eec68b.
One of three cases passed (Pipeline1200x800). Atlas desktop1365x900 was
refused because the browser supplied1364x898. The emulated mobile Atlas
returned an undefined capture rejection, exposing an error.code assumption.
That assumption is now fixed in the repository with a failing-then-passing
offline regression test; published1531 remains immutable and contains the
older error path. This is not a full native-resolution success or a Design Freeze.
The complete later run is in C:\Users\vikra\OneDrive\Desktop\offline-screenshots\native-display-2026-09-05T15-41-06-664Z-2532d9.
