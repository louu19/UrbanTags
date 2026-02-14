let svService;
let pano;
let canvas, ctx;
let draw = false;
let tags = JSON.parse(localStorage.getItem("tags")) || [];
let paths = [];
let currentPath = null;

/* ---------- DEV RESET ---------- */
function resetGraffitiDev() {
    localStorage.removeItem("tags");
    location.reload();
}

/* ---------- UTILS ---------- */
function randomLatLng() {
    return {
        lat: Math.random() * 140 - 70,
        lng: Math.random() * 360 - 180
    };
}

/* ---------- LANDING ---------- */
function initLanding() {
    const container = document.getElementById("bg-pano");

    function loadRandomSatellite() {
        const pos = randomLatLng();
        const map = new google.maps.Map(container, {
            center: pos,
            zoom: 16,
            mapTypeId: "satellite",
            disableDefaultUI: true
        });

        google.maps.event.addListenerOnce(map, "tilesloaded", () => {
            const imgs = container.querySelectorAll("img");
            if (imgs.length < 6) loadRandomSatellite();
        });
    }

    loadRandomSatellite();

    document.getElementById("exploreBtn").onclick = () => {
        svService = new google.maps.StreetViewService();

        function findStreet() {
            const pos = randomLatLng();
            svService.getPanorama({ location: pos, radius: 500 }, (data, status) => {
                if (status === "OK") {
                    localStorage.setItem("spawn", JSON.stringify({
                        lat: data.location.latLng.lat(),
                        lng: data.location.latLng.lng()
                    }));
                    location.href = "explore.html";
                } else {
                    findStreet();
                }
            });
        }

        findStreet();
    };
}

/* ---------- EXPLORE ---------- */
function initExplore() {
    svService = new google.maps.StreetViewService();
    const spawn = JSON.parse(localStorage.getItem("spawn"));

    pano = new google.maps.StreetViewPanorama(
        document.getElementById("streetview"),
        { position: spawn, pov: { heading: 0, pitch: 0 }, zoom: 1 }
    );

    const miniMap = new google.maps.Map(document.getElementById("miniMap"), {
        center: spawn,
        zoom: 14,
        mapTypeId: "roadmap",
        disableDefaultUI: true
    });

    miniMap.addListener("click", e => {
        pano.setPosition(e.latLng);
        miniMap.setCenter(e.latLng);
    });

    document.getElementById("sprayBtn").onclick = openTagUI;
}

/* ---------- TAG UI ---------- */
function openTagUI() {
    const overlay = document.getElementById("tagOverlay");
    overlay.classList.remove("d-none");

    canvas = document.getElementById("drawCanvas");
    ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";

    draw = false;
    paths = [];
    currentPath = null;
    pano.setOptions({ clickToGo: false });

    canvas.onmousedown = e => {
        draw = true;
        currentPath = {
            color: ctx.fillStyle,
            size: document.getElementById("sizePicker").value,
            points: [{ x: e.offsetX, y: e.offsetY }]
        };
    };

    canvas.onmouseup = () => { if (currentPath) paths.push(currentPath); draw = false; currentPath = null; };
    canvas.onmousemove = e => {
        if (!draw || !currentPath) return;
        currentPath.points.push({ x: e.offsetX, y: e.offsetY });
        ctx.beginPath();
        ctx.fillStyle = currentPath.color;
        ctx.arc(e.offsetX, e.offsetY, currentPath.size / 2, 0, Math.PI * 2);
        ctx.fill();
    };

    document.querySelectorAll("#colorPalette span").forEach(dot => {
        dot.style.background = dot.dataset.color;
        dot.onclick = () => ctx.fillStyle = dot.dataset.color;
    });

    document.getElementById("clearTag").onclick = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); paths = []; };
    document.getElementById("streetview").style.pointerEvents = "none";
    document.getElementById("confirmTag").onclick = saveTag;
    document.getElementById("cancelTag").onclick = closeTagUI;
}

/* ---------- TEXT DETECTION ---------- */
function detectText(paths) {
    if (!paths.length) return false;
    let totalPoints = 0, directionChanges = 0, totalLength = 0;
    paths.forEach(p => {
        totalPoints += p.points.length;
        for (let i = 2; i < p.points.length; i++) {
            const a = p.points[i - 2], b = p.points[i - 1], c = p.points[i];
            const dx1 = b.x - a.x, dy1 = b.y - a.y;
            const dx2 = c.x - b.x, dy2 = c.y - b.y;
            totalLength += Math.hypot(dx2, dy2);
            const dot = dx1 * dx2 + dy1 * dy2;
            const mag1 = Math.hypot(dx1, dy1), mag2 = Math.hypot(dx2, dy2);
            if (mag1 && mag2 && Math.acos(dot / (mag1 * mag2)) > 0.6) directionChanges++;
        }
    });
    const avgLen = totalLength / Math.max(totalPoints, 1);
    return directionChanges > 25 && avgLen < 8 && paths.length >= 3;
}

/* ---------- TREMBLIN CORE ---------- */
function drawNeutral(canvas, paths) {
    const c = canvas.getContext("2d");
    const isText = detectText(paths);
    paths.forEach(p => {
        c.strokeStyle = isText ? "#000" : p.color;
        c.lineWidth = isText ? 8 : p.size * 0.6;
        c.lineCap = "round";
        c.lineJoin = "round";
        c.beginPath();
        p.points.forEach((pt, i) => i === 0 ? c.moveTo(pt.x, pt.y) : c.lineTo(pt.x, pt.y));
        c.stroke();
    });
}

/* ---------- SAVE TAG ---------- */
function saveTag() {
    const rawCanvas = document.getElementById("drawCanvas");
    const neutralCanvas = document.createElement("canvas");
    neutralCanvas.width = rawCanvas.width;
    neutralCanvas.height = rawCanvas.height;
    drawNeutral(neutralCanvas, paths);
    const neutralImg = neutralCanvas.toDataURL();

    tags.push({
        raw: rawCanvas.toDataURL(),
        neutral: neutralImg,
        position: pano.getPosition().toJSON(),
        color: paths[0]?.color || "#000",
        time: Date.now()
    });

    localStorage.setItem("tags", JSON.stringify(tags));
    showNeutralPreview(neutralImg);
}

/* ---------- PREVIEW ---------- */
function showNeutralPreview(img) {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.8)";
    overlay.style.zIndex = "5000";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";

    overlay.innerHTML = `
      <div style="position:relative">
        <button id="closePreview" style="position:absolute;top:-40px;right:0">X</button>
        <img src="${img}" style="max-width:80vw">
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById("closePreview").onclick = () => { overlay.remove(); closeTagUI(); };
}

/* ---------- CLOSE ---------- */
function closeTagUI() {
    document.getElementById("tagOverlay").classList.add("d-none");
    pano.setOptions({ clickToGo: true });
    document.getElementById("streetview").style.pointerEvents = "auto";
}

/* ---------- MAP ---------- */
function initMap() {
    const map = new google.maps.Map(document.getElementById("mapPreview"), {
        center: { lat: 20, lng: 0 },
        zoom: 2,
        mapTypeId: "roadmap"
    });

    const tags = JSON.parse(localStorage.getItem("tags")) || [];
    tags.forEach(tag => {
        const marker = new google.maps.Marker({
            position: tag.position,
            map: map,
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: tag.color, fillOpacity: 0.9, strokeWeight: 1, strokeColor: "#fff" }
        });

        const tooltip = new google.maps.InfoWindow({
            content: `<div class="graffiti-tooltip"><strong>Graffito</strong><br><img src="${tag.neutral}" style="width:150px"><br><small>${new Date(tag.time).toLocaleString()}</small></div>`
        });

        marker.addListener("mouseover", () => tooltip.open({ anchor: marker, map, shouldFocus: false }));
        marker.addListener("mouseout", () => tooltip.close());

        // Apri Street View con versione neutra
        marker.addListener("click", () => {
            const container = document.getElementById("streetViewContainer");
            container.classList.remove("d-none");
            const panorama = new google.maps.StreetViewPanorama(container, { position: tag.position, pov: { heading: 0, pitch: 0 }, zoom: 1 });

            // Disegno neutro sul canvas
            const svCanvas = document.createElement("canvas");
            svCanvas.width = container.clientWidth;
            svCanvas.height = container.clientHeight;
            const svCtx = svCanvas.getContext("2d");
            const img = new Image();
            img.onload = () => svCtx.drawImage(img, 0, 0, svCanvas.width, svCanvas.height);
            img.src = tag.neutral;
            container.appendChild(svCanvas);

            container.onclick = () => { container.classList.add("d-none"); container.innerHTML = ""; };
        });
    });
}