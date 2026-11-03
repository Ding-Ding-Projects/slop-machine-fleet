document.querySelector('form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.querySelector('button');
  button.disabled = true;
  document.querySelector('#result').textContent = 'Connecting…';
  try { const result = await window.fleetConnection.connect(document.querySelector('#origin').value); if (!result.ok) document.querySelector('#result').textContent = result.error; }
  catch { document.querySelector('#result').textContent = 'Connection could not be completed.'; }
  finally { button.disabled = false; }
});
