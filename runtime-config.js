// GitHub Pages’de backend adresini dosyadan okuyoruz (build gerektirmez)
window.__CONFIG__ = { BACKEND_URL: "" };
fetch("./config.json")
  .then(r => r.json())
  .then(cfg => { window.__CONFIG__ = cfg; })
  .catch(()=>{});
