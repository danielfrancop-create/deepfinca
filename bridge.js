// bridge.js - Puente Inteligente (JSONP para leer, iframe para escribir)
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyLTl982nl7Wun_yX1JHtE948InXJVttya8zV05GAMvLYoUGeLhoxNFLKE5HK15ekgN/exec';

function callGAS(functionName, ...args) {
  // Si es para LEER datos, usamos JSONP (rápido y confiable)
  if (functionName === 'getDashboardData' || functionName === 'getLoteSummary' || functionName === 'exportToExcelData') {
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
        reject(new Error('Error de red'));
      };
      document.body.appendChild(script);
    });
  } 
  
  // Si es para ESCRIBIR datos, usamos el Formulario Oculto (no espera respuesta)
  else {
    return new Promise((resolve) => {
      const iframeName = 'gas_iframe_' + Date.now();
      const iframe = document.createElement('iframe');
      iframe.name = iframeName;
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = GAS_URL;
      form.target = iframeName;
      form.style.display = 'none';

      const actionInput = document.createElement('input');
      actionInput.type = 'hidden';
      actionInput.name = 'action';
      actionInput.value = functionName;
      form.appendChild(actionInput);

      const argsInput = document.createElement('input');
      argsInput.type = 'hidden';
      argsInput.name = 'args';
      argsInput.value = JSON.stringify(args);
      form.appendChild(argsInput);

      document.body.appendChild(form);
      form.submit();

      // Esperamos 1.5 segundos para que Google procese y guarde, luego asumimos éxito
      setTimeout(() => {
        document.body.removeChild(form);
        document.body.removeChild(iframe);
        resolve({ success: true });
      }, 1500);
    });
  }
}

window.callGAS = callGAS;
