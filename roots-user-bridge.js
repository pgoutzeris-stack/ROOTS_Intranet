(function () {
  const ORIGIN = 'https://pgoutzeris-stack.github.io';
  const IN_IFRAME = window.parent !== window;

  function patch(RU) {
    if (!RU || RU._bridgePatched) return;
    RU._bridgePatched = true;
    const origOpen = RU.openSettings ? RU.openSettings.bind(RU) : null;

    RU.openSettings = function () {
      if (IN_IFRAME) {
        window.parent.postMessage({ type: 'roots-open-settings' }, ORIGIN);
        return;
      }
      if (origOpen) origOpen();
    };

    if (IN_IFRAME) {
      document.getElementById('roots-user-settings-modal')?.remove();
      document.getElementById('rus-overlay')?.remove();
    }
  }

  function onProfileUpdate(RU, profile) {
    if (!RU || !profile) return;
    RU._p = { ...(RU._p || {}), ...profile };
    RU._mount?.();
    if (typeof window.onRootsTeamRefresh === 'function') window.onRootsTeamRefresh();
  }

  window.addEventListener('message', (e) => {
    if (e.origin !== ORIGIN) return;
    if (e.data?.type === 'roots-profile-updated') {
      onProfileUpdate(window.RootsUser, e.data.profile);
    }
  });

  function tryPatch() {
    if (window.RootsUser) patch(window.RootsUser);
  }

  tryPatch();
  let n = 0;
  const t = setInterval(() => {
    tryPatch();
    if (++n > 100 || (window.RootsUser && window.RootsUser._bridgePatched)) clearInterval(t);
  }, 50);

  window.RootsUserBridge = { IN_IFRAME, patch, ORIGIN };
})();
