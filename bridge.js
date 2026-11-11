// bridge.js - Envío con fetch no-cors (La solución definitiva)
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyLTl982nl7Wun_yX1JHtE948InXJVttya8zV05GAMvLYoUGeLhoxNFLKE5HK15ekgN/exec';

function callGAS(functionName, ...args) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams();
    params.append('action', functionName);
    params.append('args', JSON.stringify(args));

    fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors',
      body: params
    })
    .then(() => {
      // Como no podemos leer la respuesta, asumimos éxito.
      // Recargamos los datos después de un breve retraso.
      setTimeout(() => {
        resolve({ success: true });
      }, 1000);
    })
    .catch(err => {
      reject(err);
    });
  });
}

window.callGAS = callGAS;
