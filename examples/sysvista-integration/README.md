# SysVista integration example

`App.tsx` is source-only integration documentation rather than a separately
built application. It demonstrates the host contract around the React renderer:

- validation with raised `ValidateOptions` vocabulary limits;
- controlled selection alongside an inspector that reads validated `detail`;
- filtering selection notifications for the node currently being descended;
- resolving a deferred child key, laying out the returned spec, and replacing
  the root diagram with `fitOnReplace` intent.

The example is included in the React test TypeScript project, so `npm run check`
keeps its API usage current without adding example-specific build tooling.
