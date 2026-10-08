# Design

The UI reproduces the V114 prototypes **exactly**: same CSS, class names, ids, wording, field order and colours.

- `src/styles/hr.css` and `src/styles/employee.css` are the prototypes' style blocks, copied verbatim in the
  order the browser applied them (plus the few rules the prototypes injected at runtime). Do not tidy them:
  the components emit the prototype's markup (`.sb`, `.ni`, `.topbar`, `.card`, `.tbar/.tab`, `.mw/.modal`,
  `.hdr`, `.bnav/.bni`, `#KR`, `#ET` …) so the original cascade renders unchanged.
- Two root layouts keep the two stylesheets apart: `app/(hr)` (HR portal) and `app/(employee)` (employee app).
  Moving between them is a full page load.
- Font: ARIBA Two (Light/Medium/Bold), extracted from the HR prototype into `public/fonts`, also mapped to the
  face names the prototype used (`ARIBA Two Medium` …) so it renders without a local install.
- Icons: Tabler icons webfont 3.19.0 (as the prototype). Charts: Chart.js 4.4.0 with the prototype's colours.
- Theme: `data-ariba-theme` on `<html>` (both apps) and `ariba-light/ariba-dark` on `<body>` (employee app).
  Defaults as in the prototypes: HR portal night, employee app day.
- Language: Arabic/English wording from the prototypes' own dictionaries. The HR portal stays RTL in English
  (as the prototype); the employee app turns LTR.
- Tailwind was removed: the verbatim prototype CSS (unlayered, with `*{margin:0;padding:0}`) would override
  any layered utility classes.

Known intentional differences from the prototype: no AI assistant (out of scope); the empty duplicate
language button in the employee header and the garbled login subtitle were not copied; leave-balance cards
and other figures from unbuilt modules are omitted rather than shown with placeholder numbers.
