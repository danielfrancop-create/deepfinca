// bridge.js - Puente con técnica de Formulario Oculto (evita CORS)
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyLTl982nl7Wun_yX1JHtE948InXJVttya8zV05GAMvLYoUGeLhoxNFLKE5HK15ekgN/exec';

function callGAS(functionName, ...args) {
  return new Promise((resolve, reject) => {
    // Creamos un iframe invisible
    const iframeName = 'gas_iframe_' + Date.now();
    const iframe = document.createElement('iframe');
    iframe.name = iframeName;
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    // Creamos el formulario
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = GAS_URL;
    form.target = iframeName;
    form.style.display = 'none';

    // Metemos los datos
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

    // Escuchamos la respuesta
    iframe.onload = () => {
      try {
        const responseText = iframe.contentDocument.body.innerText;
        const result = JSON.parse(responseText);
        document.body.removeChild(form);
        document.body.removeChild(iframe);
        resolve(result);
      } catch (err) {
        document.body.removeChild(form);
        document.body.removeChild(iframe);
        reject(err);
      }
    };

    form.submit();
  });
}

window.callGAS = callGAS;
