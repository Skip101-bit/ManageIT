(function () {
  const PAGE = 'asset-lifecycle.html';

  function addNavGroup() {
    const nav = document.querySelector('.app-nav');
    if (!nav || nav.querySelector('[data-al-group]')) return;
    const group = document.createElement('div');
    group.className = 'nav-group';
    group.dataset.alGroup = '';
    group.innerHTML =
      '<span class="nav-group-label">Asset Lifecycle</span>' +
      '<div class="nav-group-links">' +
      '<a class="nav-link" href="' + PAGE + '#standard">Standard Equipment</a>' +
      '<a class="nav-link" href="' + PAGE + '#groups">Equipment Groups</a>' +
      '</div>';
    nav.appendChild(group);
  }

  function addHomeCard() {
    const grid = document.querySelector('.home-grid');
    if (!grid || grid.querySelector('[data-al-card]')) return;
    const card = document.createElement('a');
    card.className = 'home-card slate';
    card.href = PAGE + '#standard';
    card.dataset.alCard = '';
    card.innerHTML =
      '<h2>Asset Lifecycle</h2>' +
      '<p>Standard equipment types with their BOM and lifecycle, and equipment groups allocated to sites.</p>' +
      '<span>Open →</span>';
    grid.appendChild(card);
  }

  function apply() {
    addNavGroup();
    addHomeCard();
  }

  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', apply);
})();
