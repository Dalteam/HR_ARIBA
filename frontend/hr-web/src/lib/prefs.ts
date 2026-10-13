// Per-browser preference cookies, read on the server so the first paint already has the right
// language and theme. Each app keeps its own theme: the prototypes defaulted the HR portal to
// night mode and the employee app to day mode.
export const LANG_COOKIE = "ariba_lang";
export const HR_THEME_COOKIE = "ariba_hr_theme";
export const EMP_THEME_COOKIE = "ariba_emp_theme";
