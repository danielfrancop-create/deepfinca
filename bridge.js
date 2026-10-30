// bridge.js - Puente con técnica de Formulario Oculto (evita CORS)
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyLTl982nl7Wun_yX1JHtE948InXJVttya8zV05GAMvLYoUGeLhoxNFLKE5HK15ekgN/exec';

const pendingCalls = [];

async function callGAS(functionName, ...args) {
  // Si no hay red, guardamos en cola (como ya tenías)
  if (!navigator.onLine) {
    return new Promise((resolve, reject) => {
      pendingCalls.push({ functionName, args, resolve, reject });
    });
  }

  return new Promise((resolve, reject) => {
    // Creamos un iframe invisible y un formulario para enviar los datos
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

    // Metemos los datos en inputs ocultos
    const actionInput = document.createElement('input');
    actionInput.type = 'hidden';
    actionInput.name = 'action';
    actionInput.value = functionName;
    form.appendChild(actionInput);

    const argsInput = document.createElement('input');
    argsInput.type = 'hidden';
    argsInput.name = 'args';
    argsInput.value = JSON.stringify(args); // Enviamos los argumentos como texto
    form.appendChild(argsInput);

    document.body.appendChild(form);

    // Escuchamos cuando el iframe termine de cargar (es decir, cuando Google responda)
    iframe.onload = () => {
      try {
        // Leemos la respuesta que Google dejó dentro del iframe
        const responseText = iframe.contentDocument.body.innerText;
        const result = JSON.parse(responseText);
        
        // Limpiamos el DOM
        document.body.removeChild(form);
        document.body.removeChild(iframe);
        
        resolve(result);
      } catch (err) {
        // Si falla la lectura, limpiamos y rechazamos
        document.body.removeChild(form);
        document.body.removeChild(iframe);
        reject(err);
      }
    };

    // Enviamos el formulario
    form.submit();
  });
}

// Reintentar cola cuando vuelva la conexión
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
