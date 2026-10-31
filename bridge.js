// bridge.js - Puente JSONP Definitivo
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyLTl982nl7Wun_yX1JHtE948InXJVttya8zV05GAMvLYoUGeLhoxNFLKE5HK15ekgN/exec';

function callGAS(functionName, ...args) {
  return new Promise((resolve, reject) => {
    const callbackName = 'gas_callback_' + Math.floor(Math.random() * 1000000);
    
    window[callbackName] = function(response) {
      if (script.parentNode) document.body.removeChild(script);
      delete window[callbackName];
      resolve(response);
    };

    const script = document.createElement('script');
    const params = new URLSearchParams();
    params.append('action', functionName);
    params.append('args', JSON.stringify(args));
    params.append('callback', callbackName);
    
    script.src = GAS_URL + '?' + params.toString();
    
    script.onerror = function() {
      if (script.parentNode) document.body.removeChild(script);
      delete window[callbackName];
      reject(new Error('Error de red al conectar con Google'));
    };

    document.body.appendChild(script);
  });
}

window.callGAS = callGAS;
