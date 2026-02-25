<script>
    import { onDestroy, onMount } from "svelte";
    import L from "leaflet";
    import "leaflet/dist/leaflet.css";

    export let locations = [];
    export let center = [54, 15];
    export let zoom = 4;
    export let mapHeight = 400;

    let mapContainer;
    let map;
    let layerGroup;

    function getRadius(count) {
        if (count <= 1) return 3; // 3 pixels for single entries
        const scaled = Math.sqrt(count) * 2.5; // more aggressive scaling
        return Math.min(Math.max(scaled, 5), 120); // 5-120 pixels
    }

    function renderCircles() {
        if (!layerGroup || !locations?.length) {
            console.log(
                "Cannot render: layerGroup=",
                !!layerGroup,
                "locations=",
                locations?.length,
            );
            return;
        }

        console.log("Rendering circles for", locations.length, "locations");
        layerGroup.clearLayers();

        locations.forEach((loc) => {
            const lat = Number(loc.latitude);
            const lng = Number(loc.longitude);

            // console.log("Processing location:", loc.location_name, "lat:", lat, "lng:", lng);

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                console.log("Skipping invalid coords");
                return;
            }

            const count = Array.isArray(loc.people) ? loc.people.length : 0;

            L.circleMarker([lat, lng], {
                radius: getRadius(count),
                color: "black",
                weight: 1,
                fillColor: "black",
                fillOpacity: 0.1,
            })
                .bindPopup(`${loc.location_name ?? "Unknown"} (${count})`)
                .addTo(layerGroup);
        });
    }

    onMount(() => {
        console.log("Mounting map, locations=", locations?.length);

        map = L.map(mapContainer, {
            zoomControl: true,
        }).setView(center, zoom);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap contributors",
            maxZoom: 18,
        }).addTo(map);

        layerGroup = L.layerGroup().addTo(map);

        // Initial render
        console.log("Initial render with locations:", locations?.length);
        renderCircles();
    });

    $: if (map && layerGroup && locations?.length) {
        console.log(
            "Reactive: re-rendering with",
            locations.length,
            "locations",
        );
        renderCircles();
    }

    $: if (map && center && zoom) {
        map.setView(center, zoom);
    }

    onDestroy(() => {
        if (map) {
            map.remove();
            map = null;
        }
    });
</script>

<div class="leaflet-map" bind:this={mapContainer}></div>

<style>
    .leaflet-map {
        width: 100%;
        height: 100vh;
        border-radius: 10px;
        overflow: hidden;
    }
</style>
