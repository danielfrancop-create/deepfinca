// bridge.js - Capa de comunicación con Google Apps Script (Versión Corregida)
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxZXNYHGFVSWGQOEsmOsmzrQTog5Sxb4EXQjvsJmpx9W8OBRbO_l6xL1drnmPedfaUH/exec';

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
      // Debido a la restricción no-cors, la respuesta opaca se maneja asumiendo éxito
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
