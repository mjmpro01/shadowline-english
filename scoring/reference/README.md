# Archived reference implementation

The TypeScript scorer that used to run in the browser, kept so the parity
fixtures can be regenerated and so their provenance is checkable.

Nothing imports this. The app no longer scores anything, and `shadowline/` is
the implementation that runs. This exists because deleting it would have left
`tests/fixtures/expected.json` as a file of numbers with no way to produce them
again — which is not a fixture, it is a claim.

```bash
cd scoring/reference
npm install
npm run generate     # rewrites ../tests/fixtures/
cd .. && pytest      # must still pass, unchanged
```

If regenerating changes any number, either this code changed or the Python did,
and `tests/test_parity.py` will say which cases moved.
