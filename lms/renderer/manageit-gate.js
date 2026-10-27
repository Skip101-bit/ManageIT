(function () {
  if (window.electronApp) return;

  if (!sessionStorage.getItem('manageit_session') || sessionStorage.getItem('manageit_can_access_lms') !== '1') {
    sessionStorage.setItem('manageit_brand', 'lms');
    location.replace('/');
    return;
  }

  function signOut() {
    sessionStorage.removeItem('manageit_session');
    sessionStorage.removeItem('manageit_token');
    sessionStorage.removeItem('manageit_can_access_lms');
    sessionStorage.setItem('manageit_brand', 'lms');
    location.href = '/';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Sign out';
    btn.title = 'Sign out and return to the login page';
    btn.style.cssText = [
      'position:fixed', 'left:16px', 'bottom:16px', 'z-index:2147483647',
      'padding:8px 14px', 'border:0', 'border-radius:999px',
      'background:#059669', 'color:#fff', 'font:600 13px system-ui,sans-serif',
      'box-shadow:0 4px 14px rgba(6,78,59,.35)', 'cursor:pointer'
    ].join(';');
    btn.addEventListener('click', signOut);
    document.body.appendChild(btn);
  });
})();
