// «رجوع» that always goes somewhere. In the installed web app a page can be the first one of the session (a reload, a link, the app
// reopened on that page): there is no history to go back to and router.back() does nothing, so the button looked dead.
import { router } from "expo-router";

export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}
