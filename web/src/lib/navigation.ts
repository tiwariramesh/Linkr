// Lets code outside components (store actions, helpers) change the page.
// AppShell registers React Router's navigate function here.
let navigator: (to: string) => void = (to) => window.location.assign(to);

export const setNavigator = (navigate: (to: string) => void) => {
  navigator = navigate;
};

export const navigateTo = (to: string) => navigator(to);
