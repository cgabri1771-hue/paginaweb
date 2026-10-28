// ---------- Capa de almacenamiento (IndexedDB) ----------
// Si más adelante pasamos a un servidor (opción B), solo hay que reemplazar
// estas cuatro funciones; el resto de la página queda igual.

const DB_NOMBRE = "plan-mantenimiento";
const TABLA = "propiedades";
const MAX_FOTOS = 5;

function abrirDB() {
  return new Promise((resolver, rechazar) => {
    const pedido = indexedDB.open(DB_NOMBRE, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(TABLA, { keyPath: "id" });
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rechazar(pedido.error);
  });
}

async function operar(modo, accion) {
  const db = await abrirDB();
  return new Promise((resolver, rechazar) => {
    const t = db.transaction(TABLA, modo);
    const pedido = accion(t.objectStore(TABLA));
    t.oncomplete = () => resolver(pedido.result);
    t.onerror = () => rechazar(t.error);
  });
}

const listarPropiedades = () => operar("readonly", (s) => s.getAll());
const obtenerPropiedad = (id) => operar("readonly", (s) => s.get(id));
const guardarPropiedad = (p) => operar("readwrite", (s) => s.put(p));
const borrarPropiedad = (id) => operar("readwrite", (s) => s.delete(id));

// ---------- Elementos de la página ----------

const vistaLista = document.getElementById("vista-lista");
const vistaForm = document.getElementById("vista-form");
const lista = document.getElementById("lista");
const listaVacia = document.getElementById("lista-vacia");
const form = document.getElementById("form");
const formTitulo = document.getElementById("form-titulo");
const fotosInput = document.getElementById("fotos-input");
const fotosPrevia = document.getElementById("fotos-previa");
const fotosContador = document.getElementById("fotos-contador");

let propiedadActual = null; // la que se está editando (null = nueva)
let fotos = []; // fotos de la propiedad en pantalla (data URLs)

// ---------- Navegación entre vistas ----------

function mostrarLista() {
  vistaForm.hidden = true;
  vistaLista.hidden = false;
  renderLista();
}

function mostrarForm(propiedad) {
  propiedadActual = propiedad || null;
  formTitulo.textContent = propiedad ? "Editar propiedad" : "Nueva propiedad";
  form.reset();
  if (propiedad) {
    for (const [campo, valor] of Object.entries(propiedad.datos)) {
      if (form.elements[campo]) form.elements[campo].value = valor;
    }
  }
  fotos = propiedad ? [...propiedad.fotos] : [];
  renderFotos();
  vistaLista.hidden = true;
  vistaForm.hidden = false;
  window.scrollTo(0, 0);
}

// ---------- Lista de propiedades ----------

async function renderLista() {
  const propiedades = await listarPropiedades();
  propiedades.sort((a, b) => b.actualizado - a.actualizado);
  lista.replaceChildren();
  listaVacia.hidden = propiedades.length > 0;

  for (const p of propiedades) {
    const d = p.datos;
    const item = document.createElement("li");
    item.className = "tarjeta";

    if (p.fotos[0]) {
      const img = document.createElement("img");
      img.src = p.fotos[0];
      img.alt = "Foto de " + d.nombre;
      item.append(img);
    }

    const info = document.createElement("div");
    info.className = "info";
    const titulo = document.createElement("h3");
    titulo.textContent = d.nombre;
    const detalle = document.createElement("p");
    detalle.textContent =
      `${d.tipo} · ${d.antiguedad} años · ${d.localidad}, ${d.provincia}, ${d.pais} (${d.cp})`;
    info.append(titulo, detalle);

    const botones = document.createElement("div");
    botones.className = "botones";
    const editar = document.createElement("button");
    editar.textContent = "Ver / editar";
    editar.onclick = async () => mostrarForm(await obtenerPropiedad(p.id));
    const borrar = document.createElement("button");
    borrar.textContent = "Borrar";
    borrar.className = "peligro";
    borrar.onclick = async () => {
      if (confirm(`¿Borrar "${d.nombre}"? No se puede deshacer.`)) {
        await borrarPropiedad(p.id);
        renderLista();
      }
    };
    botones.append(editar, borrar);

    item.append(info, botones);
    lista.append(item);
  }
}

// ---------- Fotos ----------

// Achica la imagen para que ocupe poco espacio en el navegador.
function achicarImagen(archivo, ladoMax = 1280) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onerror = () => rechazar(lector.error);
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => rechazar(new Error("No se pudo leer la imagen"));
      img.onload = () => {
        const escala = Math.min(1, ladoMax / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolver(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

function renderFotos() {
  fotosPrevia.replaceChildren();
  fotos.forEach((src, i) => {
    const caja = document.createElement("div");
    caja.className = "foto";
    const img = document.createElement("img");
    img.src = src;
    img.alt = "Foto " + (i + 1);
    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.textContent = "×";
    quitar.title = "Quitar foto";
    quitar.onclick = () => {
      fotos.splice(i, 1);
      renderFotos();
    };
    caja.append(img, quitar);
    fotosPrevia.append(caja);
  });
  fotosContador.textContent = `${fotos.length} de ${MAX_FOTOS} fotos`;
  fotosInput.disabled = fotos.length >= MAX_FOTOS;
}

fotosInput.addEventListener("change", async () => {
  const archivos = [...fotosInput.files];
  fotosInput.value = "";
  const lugar = MAX_FOTOS - fotos.length;
  if (archivos.length > lugar) {
    alert(`Solo se pueden cargar ${MAX_FOTOS} fotos. Se agregarán las primeras ${lugar}.`);
  }
  for (const archivo of archivos.slice(0, lugar)) {
    try {
      fotos.push(await achicarImagen(archivo));
    } catch {
      alert(`No se pudo cargar "${archivo.name}".`);
    }
  }
  renderFotos();
});

// ---------- Guardar ----------

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const datos = {};
  for (const campo of form.elements) {
    if (campo.name) datos[campo.name] = campo.value.trim();
  }
  const propiedad = {
    id: propiedadActual ? propiedadActual.id : crypto.randomUUID(),
    datos,
    fotos,
    actualizado: Date.now(),
  };
  try {
    await guardarPropiedad(propiedad);
    mostrarLista();
  } catch {
    alert("No se pudo guardar. Puede que el navegador no tenga espacio disponible.");
  }
});

document.getElementById("btn-nueva").onclick = () => mostrarForm(null);
document.getElementById("btn-cancelar").onclick = mostrarLista;

mostrarLista();
