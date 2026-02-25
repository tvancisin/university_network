<script>
  import * as d3 from "d3";

  export let width = 0;
  export let height = 0;
  export let features = [];
  export let uniLocations = [];
  export let uniConnectionsLocations = [];
  export let capitalsConnections = [];
  export let highlightedNames = [
    "Prague",
    "Rostock",
    "Krakow",
    "Toulouse",
    "St Andrews",
    "Glasgow",
    "Perugia",
    "Padua",
    "Wittenberg",
    "Vienna",
  ];

  let hovered = null;
  let allLocs = [];
  let allConnLocs = [];
  let allLines = [];
  let universities = [];
  let connections = [];
  let bundle = { nodes: [], links: [], paths: [] };
  let simulation;

  // projection
  $: europeProjection = d3
    .geoOrthographic()
    .center([4, 55])
    .scale([width * 1.1])
    .rotate([7, 0, 7])
    .translate([width * 0.38, height / 2.5]);

  // draw geojson polygons
  $: pathGenerator = d3.geoPath().projection(europeProjection);

  // calculate x,y screen positions of universities
  function universityPositions(locations) {
    if (!Array.isArray(locations)) return [];

    return locations.map((d) => {
      const longitude = parseFloat(d.longitude);
      const latitude = parseFloat(d.latitude);
      const coords = europeProjection([longitude, latitude]);

      return {
        ...d,
        longitude,
        latitude,
        x: coords[0],
        y: coords[1],
        outgoing: 0,
        incoming: 0,
        flights: [],
      };
    });
  }

  function universityConnections(links) {
    if (!Array.isArray(links)) return [];
    return links.map((d) => ({
      ...d,
      num: parseInt(d.num, 10),
    }));
  }

  $: if (width) {
    allLocs = universityPositions(uniLocations);
    allConnLocs = universityPositions(uniConnectionsLocations);
    allLines = universityConnections(capitalsConnections);
  }

  $: if (allConnLocs.length && allLines.length) {
    universities = allConnLocs;
    const iata = new Map(universities.map((node) => [node.name, node]));

    connections = allLines
      .map((link) => {
        const source = iata.get(link.start);
        const target = iata.get(link.end);
        if (!source || !target) return null;

        source.outgoing += link.num;
        target.incoming += link.num;

        return { ...link, source, target };
      })
      .filter(Boolean);
  } else {
    universities = [];
    connections = [];
  }

  $: hypotenuse = Math.sqrt(width * width + height * height);
  $: scales = {
    airports: d3.scaleSqrt().range([1.4, 14]),
    segments: d3.scaleLinear().domain([0, hypotenuse]).range([1, 30]),
  };

  $: lineGenerator = d3
    .line()
    .curve(d3.curveBundle)
    .x((d) => d.x)
    .y((d) => d.y);

  function distance(source, target) {
    const dx2 = Math.pow(target.x - source.x, 2);
    const dy2 = Math.pow(target.y - source.y, 2);
    return Math.sqrt(dx2 + dy2);
  }

  function generateSegments(nodes, links) {
    if (!Array.isArray(nodes) || !Array.isArray(links)) {
      return { nodes: [], links: [], paths: [] };
    }

    let bundle = { nodes: [], links: [], paths: [] };

    bundle.nodes = nodes.map((d) => {
      d.fx = d.x;
      d.fy = d.y;
      return d;
    });

    links.forEach((d) => {
      let length = distance(d.source, d.target);
      let total = Math.round(scales.segments(length));

      let xscale = d3
        .scaleLinear()
        .domain([0, total + 1])
        .range([d.source.x, d.target.x]);

      let yscale = d3
        .scaleLinear()
        .domain([0, total + 1])
        .range([d.source.y, d.target.y]);

      let source = d.source;
      let target = null;
      let local = [source];

      for (let j = 1; j <= total; j++) {
        target = {
          x: xscale(j),
          y: yscale(j),
        };

        local.push(target);
        bundle.nodes.push(target);

        bundle.links.push({
          source: source,
          target: target,
        });

        source = target;
      }

      local.push(d.target);

      bundle.links.push({
        source: target,
        target: d.target,
      });

      bundle.paths.push(local);
    });

    return bundle;
  }

  $: bundle = generateSegments(universities, connections);

  $: if (bundle?.nodes?.length) {
    simulation = d3
      .forceSimulation(bundle.nodes)
      .alphaDecay(0)
      .force("charge", d3.forceManyBody().strength(2).distanceMax(1000))
      .force("link", d3.forceLink(bundle.links).strength(0.9).distance(5));

    for (let i = 0, n = 100; i < n; ++i) {
      simulation.tick();
    }
  } else {
    simulation = null;
  }

  $: graticule = d3.geoGraticule().step([10, 10]);
</script>

<div class="map">
  <svg {width} {height}>
    <path d={pathGenerator({ type: "Sphere" })} fill="#e6e6e6" stroke="none" />
    <path
      d={pathGenerator(graticule())}
      fill="none"
      stroke="white"
      stroke-width="0.5"
      opacity="1"
    />

    {#each features as feature}
      <path
        d={pathGenerator(feature)}
        stroke="white"
        stroke-width="0.5"
        fill="#b3b3b3"
      />
    {/each}
    {#each bundle?.paths ?? [] as b}
      <path
        d={lineGenerator(b)}
        fill="none"
        stroke="black"
        stroke-width="0.5"
        opacity="0.5"
      />
    {/each}
    {#each allLocs as l}
      <circle
        cx={l.x}
        cy={l.y}
        r={hovered === l ? 6 : highlightedNames.includes(l.name) ? 5 : 2}
        fill={highlightedNames.includes(l.name) ? "orange" : "black"}
        stroke="black"
        stroke-width="1"
        role="img"
        aria-label={l.name}
        cursor="pointer"
        on:mouseenter={() => (hovered = l)}
        on:mouseleave={() => (hovered = null)}
      />
    {/each}
  </svg>
  {#if hovered}
    <div class="tooltip" style="left:{hovered.x}px; top:{hovered.y - 5}px">
      {hovered.name}
    </div>
  {/if}
</div>

<style>
  .map {
    position: relative;
    width: 100%;
    height: 100vh;
  }

  .tooltip {
    position: absolute;
    pointer-events: none;
    background: rgba(0, 0, 0, 0.75);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.8rem;
    font-family: "Montserrat";
    white-space: nowrap;
    transform: translate(-50%, -100%);
  }
</style>
