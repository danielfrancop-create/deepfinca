// bridge.js - Puente entre GitHub Pages y Google Apps Script Web App
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyLTl982nl7Wun_yX1JHtE948InXJVttya8zV05GAMvLYoUGeLhoxNFLKE5HK15ekgN/exec';

async function callGAS(functionName, ...args) {
  if (!navigator.onLine) {
    return new Promise((resolve, reject) => {
      pendingCalls.push({ functionName, args, resolve, reject });
    });
  }

  try {
    // Usamos FormData para evitar el bloqueo de CORS de Google
    const formData = new FormData();
    formData.append('action', functionName);
    formData.append('args', JSON.stringify(args));

    const response = await fetch(GAS_URL, {
      method: 'POST',
      body: formData // FormData añade automáticamente el formato correcto
    });

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error llamando a GAS:', error);
    throw error;
  }
}

const pendingCalls = [];

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

window.callGAS = callGAS;
