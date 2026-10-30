// bridge.js - Puente entre GitHub Pages y Google Apps Script Web App
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyLTl982nl7Wun_yX1JHtE948InXJVttya8zV05GAMvLYoUGeLhoxNFLKE5HK15ekgN/exec';

// Cola de llamadas pendientes cuando está offline
const pendingCalls = [];

async function callGAS(functionName, ...args) {
  // Si no hay red, encolar para después
  if (!navigator.onLine) {
    return new Promise((resolve, reject) => {
      pendingCalls.push({ functionName, args, resolve, reject });
    });
  }

  try {
    // Apps Script Web App acepta POST con form-urlencoded (evita preflight CORS)
   const formData = new FormData();
formData.append('action', functionName);
formData.append('args', JSON.stringify(args));

const response = await fetch(GAS_URL, {
   method: 'POST',
   body: formData // Usar FormData evita el bloqueo CORS de Google
 });
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error llamando a GAS:', error);
    throw error;
  }
}

// Procesar cola cuando vuelve la conexión
window.addEventListener('online', async () => {
  while (pendingCalls.length > 0) {
    const call = pendingCalls.shift();
    try {
      const result = await callGAS(call.functionName, ...call.args);
      call.resolve(result);
    } catch (e) {
      call.reject(e);
    }
  }
});

// Exportar global para que JavaScript.txt lo use
window.callGAS = callGAS;
