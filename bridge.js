// bridge.js - Puente con técnica JSONP (La definitiva)
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyLTl982nl7Wun_yX1JHtE948InXJVttya8zV05GAMvLYoUGeLhoxNFLKE5HK15ekgN/exec';

function callGAS(functionName, ...args) {
  return new Promise((resolve, reject) => {
    // Creamos un nombre único para la función de respuesta
    const callbackName = 'gas_callback_' + Date.now();
    
    // Definimos la función global que Google llamará cuando responda
    window[callbackName] = function(response) {
      document.body.removeChild(script);
      delete window[callbackName];
      resolve(response);
    };

    // Creamos la etiqueta <script> apuntando a Google
    const script = document.createElement('script');
    const params = new URLSearchParams();
    params.append('action', functionName);
    params.append('args', JSON.stringify(args));
    params.append('callback', callbackName); // Le decimos a Google cómo responder
    
    script.src = GAS_URL + '?' + params.toString();
    script.onerror = function() {
      document.body.removeChild(script);
      delete window[callbackName];
      reject(new Error('Error de red al conectar con Google'));
    };

    document.body.appendChild(script);
  });
}

window.callGAS = callGAS;
