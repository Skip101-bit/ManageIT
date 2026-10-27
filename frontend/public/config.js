/**
 * ManageIT API configuration
 * When the API is running (dotnet run), the app syncs with SQL Server.
 * Set useApi to false to use browser localStorage only (offline/demo mode).
 */
window.ManageITConfig = {
  apiBaseUrl: window.location.origin,
  useApi: true,
  syncDebounceMs: 800
};
