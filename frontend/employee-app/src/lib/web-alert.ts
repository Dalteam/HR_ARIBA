// Native: React Native's Alert already works. The web build replaces it (see web-alert.web.ts): the browser has no native Alert,
// so every «are you sure?» (delete a request, delete a target, approve with signature…) did nothing in the installed app.
export {};
