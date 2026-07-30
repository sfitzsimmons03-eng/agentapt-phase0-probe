/* Paste this in the PAGE DevTools console (Cmd+Option+J on the Harbour Lane tab).
 * Works even if __probe* is undefined — reads localStorage backup and downloads JSON.
 */
(function () {
  var KEY = 'agentapt_probe_v2';
  var raw = localStorage.getItem(KEY);
  if (!raw) {
    // also check old key once
    raw = localStorage.getItem('agentapt_probe_v1');
    if (!raw) {
      console.warn('No backup in localStorage');
      return;
    }
  }
  var blob = new Blob([JSON.stringify(JSON.parse(raw), null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'probe-recover-paste-' + Date.now() + '.json';
  a.click();
  console.log('Downloaded. started=', JSON.parse(raw).started, 'pages=', (JSON.parse(raw).pages || []).length);
})();
