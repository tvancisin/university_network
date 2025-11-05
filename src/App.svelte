<script>
  import * as d3 from "d3";
  import { onMount } from "svelte";
  import { unis, links, universities_coordiantes } from "./utils";

  let width = 400,
    height = 500,
    bar_height = 2000;
  // gantt chart variables
  let other_universities = [];
  let enhancedLinks;
  // map variables
  let map,
    features = [],
    all_locs = [],
    all_conn_locs = [],
    all_lines = [],
    universities = [],
    connections = [],
    uni_locations = [],
    uni_connections_locations = [],
    capitals_connections_object = [];

  // load the data
  Promise.all([
    d3.json("universities.json"),
    d3.csv("capitals.csv"),
    d3.json("europe.json"),
  ]).then(function (files) {
    // map data
    other_universities = files[0];

    const groupedMatches = unis.map((univ) => {
      const aliases = univ.aliases || [univ.name];
      const matchedPeople = other_universities.filter((person) =>
        (person.other_universities || []).some((entry) =>
          aliases.some((alias) =>
            entry?.location?.original_name
              ?.toLowerCase()
              .includes(alias.toLowerCase()),
          ),
        ),
      );

      return {
        name: univ.name,
        people: matchedPeople,
      };
    });

    const filteredMatches = groupedMatches.filter(
      (group) => group.people.length > 0,
    );

    console.log(filteredMatches[22].people);
    filteredMatches[22].people.forEach((person) => {
      console.log(person.forename, person.surname);
    });

    // Use a Set to keep track of unique ids
    const uniqueIds = new Set();

    filteredMatches.forEach((university) => {
      university.people.forEach((person) => {
        uniqueIds.add(person.id);
      });
    });

    console.log("Unique count:", uniqueIds.size);
    console.log("Unique IDs:", [...uniqueIds]);

    enhancedLinks = links.map((link) => {
      const match = filteredMatches.find((m) => m.name === link.target.name);
      return {
        ...link,
        number: match ? match.people.length : undefined,
      };
    });

    // --------------------------------------------------------

    map = files[2];
    features = map.features;

    // uni data
    for (let i = 0; i < universities_coordiantes.length - 1; i++) {
      uni_locations.push({
        name: universities_coordiantes[i].name,
        latitude: +universities_coordiantes[i].lat,
        longitude: +universities_coordiantes[i].lon,
      });
    }

    for (let i = 0; i < universities_coordiantes.length; i++) {
      const uni = universities_coordiantes[i];
      const isTarget = links.some((link) => link.target.name === uni.name);

      if (isTarget || uni.name == "St Andrews") {
        uni_connections_locations.push({
          name: uni.name,
          latitude: +uni.lat,
          longitude: +uni.lon,
        });
      }
    }

    for (let y = 0; y < links.length - 1; y++) {
      capitals_connections_object.push({
        start: links[y].source.name,
        end: links[y].target.name,
        num: 2,
      });
    }

    // data for all university locations
    all_locs = university_positions(uni_locations);
    // data for connected university locations
    all_conn_locs = university_positions(uni_connections_locations);
    console.log(all_conn_locs);

    // data for university connections
    all_lines = university_connections(capitals_connections_object);
  });

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
  function university_positions(location) {
    location.forEach(function (d) {
      d.longitude = parseFloat(d.longitude);
      d.latitude = parseFloat(d.latitude);
      const coords = europeProjection([d.longitude, d.latitude]);
      d.x = coords[0];
      d.y = coords[1];
      d.outgoing = 0;
      d.incoming = 0;
      d.flights = [];
    });
    return location;
  }

  function university_connections(link) {
    link.forEach(function (d) {
      d.num = parseInt(d.num);
    });
    return link;
  }

  $: if (width) {
    all_locs = university_positions(uni_locations);
    all_conn_locs = university_positions(uni_connections_locations);
    all_lines = university_connections(capitals_connections_object);
  }

  $: if (all_conn_locs && all_lines) {
    universities = all_conn_locs;
    connections = all_lines;

    // convert universities array (pre filter) into map for fast lookup
    let iata = new Map(universities.map((node) => [node.name, node]));

    // calculate incoming and outgoing degree based on connections
    // connections are given by university iata code (not index)
    connections.forEach(function (link) {
      link.source = iata.get(link.start);
      link.target = iata.get(link.end);

      link.source.outgoing += link.num;
      link.target.incoming += link.num;
    });
  }

  let bundle;
  let simulation;
  $: hypotenuse = Math.sqrt(width * width + height * height);
  $: scales = {
    // used to scale university bubbles
    airports: d3.scaleSqrt().range([1.4, 14]),
    // used to scale number of segments per line
    segments: d3.scaleLinear().domain([0, hypotenuse]).range([1, 30]),
  };

  // draw paths between universities
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
    // generate separate graph for edge bundling
    // nodes: all nodes including control nodes
    // links: all individual segments (source to target)
    // paths: all segments combined into single path for drawing
    let bundle = { nodes: [], links: [], paths: [] };

    // make existing nodes fixed
    bundle.nodes = nodes.map(function (d, i) {
      d.fx = d.x;
      d.fy = d.y;
      return d;
    });

    links.forEach(function (d, i) {
      // calculate the distance between the source and target
      let length = distance(d.source, d.target);

      // calculate total number of inner nodes for this link
      let total = Math.round(scales.segments(length));

      // create scales from source to target
      let xscale = d3
        .scaleLinear()
        .domain([0, total + 1]) // source, inner nodes, target
        .range([d.source.x, d.target.x]);

      let yscale = d3
        .scaleLinear()
        .domain([0, total + 1])
        .range([d.source.y, d.target.y]);

      // initialize source node
      let source = d.source;
      let target = null;

      // add all points to local path
      let local = [source];

      for (let j = 1; j <= total; j++) {
        // calculate target node
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

      // add last link to target node
      bundle.links.push({
        source: target,
        target: d.target,
      });

      bundle.paths.push(local);
    });

    return bundle;
  }

  // final data bundle
  $: bundle = generateSegments(universities, connections);

  // edge bundling
  $: simulation = d3
    .forceSimulation(bundle.nodes)
    .alphaDecay(0)
    .force("charge", d3.forceManyBody().strength(2).distanceMax(1000))
    .force("link", d3.forceLink(bundle.links).strength(0.9).distance(5));

  // Run simulation to stabilize
  $: {
    for (let i = 0, n = 100; i < n; ++i) {
      simulation.tick();
    }
  }

  $: graticule = d3.geoGraticule().step([10, 10]);

  // -----------------------------------------------------

  // // Reactive margins and dimensions
  const margin = { top: 10, right: 30, bottom: 25, left: 100 };

  // Reactive scales
  $: xScale = d3
    .scaleLinear()
    .domain([1000, 2000])
    .range([width / 3, width - margin.right]);

  $: yScale = d3
    .scaleBand()
    .domain(unis.map((d) => d.name))
    .range([margin.top, bar_height - margin.bottom])
    .padding(0.2);

  // axes for scatterplot
  let x_axis_grp;
  let y_axis_grp;

  $: if (x_axis_grp) {
    const xAxis = d3.axisBottom(xScale);
    // d3.select(x_axis_grp).call(xAxis);
    // const yAxis = d3.axisLeft(yScale);
    // d3.select(y_axis_grp).call(yAxis);
    xAxis.tickFormat(d3.format("~d")); // remove commas, no decimal

    d3.select(x_axis_grp)
      .call(xAxis)
      .selectAll("text")
      .style("font-size", "12px")
      // .style("font-family", "Montserrat")
      .style("font-weight", 600);
  }
  let textWidths = {};

  onMount(() => {
    // Measure each text element by ID or ref after mount
    unis.forEach((d) => {
      const el = document.getElementById(`text-${d.name}`);
      if (el) textWidths[d.name] = el.getBBox().width;
    });
  });

  function getTextShift(name) {
    // Add some padding to the width
    return textWidths[name] ? textWidths[name] + 15 : 10; // fallback to 15px
  }

  function generatePath(link) {
    const shiftTarget = getTextShift(link.target.name);
    const shiftSource = getTextShift(link.source.name);

    const x1 = xScale(link.source.est) - shiftSource;
    const y1 = yScale(link.source.name) + 8;
    const x2 = xScale(link.target.est) - shiftTarget;
    const y2 = yScale(link.target.name) + 8;

    const dy = Math.abs(y2 - y1); // vertical distance between source and target

    // Bulge is based on vertical distance
    const bulge = Math.max(30, dy * 0.9); // Adjust 1.5 or 30 as needed

    return `
    M ${x1},${y1}
    C ${x1 - bulge},${y1}
      ${x2 - bulge},${y2}
      ${x2},${y2}
  `;
  }

  const linkedNames = new Set();
  links.forEach((link) => {
    linkedNames.add(link.source.name);
    linkedNames.add(link.target.name);
  });

  let scale_path = d3.scaleLinear().domain([1, 3000]).range([1, 10]);

  // gantt
  const parse = d3.timeParse("%Y-%m-%d");
  let tasks = [
    {
      id: 1,
      name: "Onboarding, equipment setup, detailed analysis",
      start: parse("2026-10-01"),
      end: parse("2026-11-01"),
    },
    {
      id: 2,
      name: "Familiarizing with partnering university databases",
      start: parse("2026-10-01"),
      end: parse("2027-01-01"),
    },
    {
      id: 3,
      name: "Data gathering, NER, data enrichment",
      start: parse("2026-11-01"),
      end: parse("2029-04-01"), // extended by +3 months
    },
    {
      id: 4,
      name: "Database schema development",
      start: parse("2026-12-01"),
      end: parse("2027-05-01"), // +1 month
    },
    {
      id: 5,
      name: "Visualization prototype development",
      start: parse("2027-04-01"),
      end: parse("2028-01-01"), // +1 month
    },
    {
      id: 6,
      name: "Visualization prototype evaluation (user studies, workshops)",
      start: parse("2028-01-01"),
      end: parse("2028-04-01"), // shifted +1 month
    },
    {
      id: 7,
      name: "Visualization prototype refinement",
      start: parse("2028-04-01"),
      end: parse("2029-06-01"), // +2 months
    },
    {
      id: 8,
      name: "Dissemination & communication",
      start: parse("2027-06-01"),
      end: parse("2029-08-01"), // +3 months
    },
    {
      id: 9,
      name: "Guidelines and framework for universities",
      start: parse("2027-11-01"),
      end: parse("2029-07-01"), // +4 months
    },
    {
      id: 10,
      name: "Final report & closing dissemination",
      start: parse("2028-10-01"),
      end: parse("2029-10-01"), // +12 months to close project at 36 months
    },
  ];

  // Layout
  let rowHeight = 28;

  // Scales (reactive so they update when tasks change)
  $: xExtent = [d3Min(tasks, (d) => d.start), d3Max(tasks, (d) => d.end)];

  $: x = d3
    .scaleTime()
    .domain(xExtent)
    .range([margin.left * 4, width - margin.right]);

  $: y = d3
    .scaleBand()
    .domain(tasks.map((t) => t.name))
    .range([margin.top, height - 80])
    .padding(0.2);

  // Axis container ref
  let xAxisG;

  // Format for tooltip / axis ticks
  const fmt = d3.timeFormat("%b %d");
  function monthDiff(a, b) {
    return (
      (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
    );
  }

  onMount(() => {
    // render axis once and each time the domain changes
    renderXAxis();
  });

  // Rerender axis whenever x or width change
  $: if (xAxisG || width) renderXAxis();

  function renderXAxis() {
    const [d0, d1] = x.domain();
    const start0 = d3.timeMonth.floor(d0);
    const end1 = d3.timeMonth.ceil(d1);

    // base ticks every 3 months starting at start0 (includes 0)
    let ticks = d3.timeMonth.every(3).range(start0, end1);

    // ensure 0 is included
    if (!ticks.some((t) => monthDiff(start0, t) === 0)) {
      ticks.unshift(start0);
    }

    // create the 24-month tick (relative to start0)
    const tick24 = d3.timeMonth.offset(start0, 36);

    // if tick24 is beyond the current domain end, extend the domain
    if (tick24.getTime() > d1.getTime()) {
      x.domain([d0, tick24]);
    }

    // recompute end and ticks to reflect any domain extension
    const finalEnd = d3.timeMonth.ceil(x.domain()[1]);
    ticks = d3.timeMonth.every(3).range(start0, finalEnd);

    // ensure 24 is included in ticks array and sort them
    if (!ticks.some((t) => monthDiff(start0, t) === 36)) ticks.push(tick24);
    ticks.sort((a, b) => a - b);

    const axis = d3
      .axisBottom(x)
      .tickValues(ticks)
      .tickFormat((d) => monthDiff(start0, d))
      .tickSize(-(height - margin.top - margin.bottom))
      .tickPadding(6);

    d3.select(xAxisG)
      .call(axis)
      .selectAll("line")
      .attr("stroke-dasharray", "4,2");

    d3.select(xAxisG).selectAll("path").remove();
    d3.select(xAxisG)
      .selectAll("text")
      .attr("font-size", "20px")
      .attr("font-weight", "700");
  }

  function d3Min(arr, fn) {
    return arr.reduce((acc, d) => {
      const v = fn(d);
      return acc == null || v < acc ? v : acc;
    }, null);
  }
  function d3Max(arr, fn) {
    return arr.reduce((acc, d) => {
      const v = fn(d);
      return acc == null || v > acc ? v : acc;
    }, null);
  }

  function wrapWords(text, maxWords = 3) {
    const words = text.split(/\s+/);
    const lines = [];
    for (let i = 0; i < words.length; i += maxWords) {
      lines.push(words.slice(i, i + maxWords).join(" "));
    }
    return lines;
  }

  let hovered = null;
  let highlightedNames = [
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
</script>

<main bind:clientWidth={width} bind:clientHeight={height}>
  <!-- map -->
  <svg {width} {height}>
    <!-- <path d={pathGenerator({ type: "Sphere" })} fill="#e6e6e6" stroke="none" />
    <path
      d={pathGenerator(graticule())}
      fill="none"
      stroke="white"
      stroke-width="0.5"
      opacity="1"
    /> -->

    {#each features as feature}
      <path
        d={pathGenerator(feature)}
        stroke="white"
        stroke-width="0.5"
        fill="#b3b3b3"
      />
    {/each}
    {#each bundle.paths as b}
      <path
        d={lineGenerator(b)}
        fill="none"
        stroke="black"
        stroke-width="0.5"
        opacity="0.5"
      />
    {/each}
    {#each all_locs as l}
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

  <!-- gantt -->
  <svg {width} height={bar_height}>
    <g
      bind:this={x_axis_grp}
      transform={`translate(0, ${bar_height - margin.bottom + 1})`}
    />
    {#each enhancedLinks as link}
      <path
        d={generatePath(link)}
        stroke="gray"
        fill="none"
        stroke-width={scale_path(5)}
      />
    {/each}

    {#each unis as d}
      <rect
        x={xScale(d.established)}
        y={yScale(d.name)}
        width={xScale(2000) - xScale(d.established)}
        height={yScale.bandwidth()}
        fill="#e6e6e6"
      />
      {#if d.start !== null}
        <rect
          x={xScale(d.start)}
          y={yScale(d.name)}
          width={xScale(d.end) - xScale(d.start)}
          height={yScale.bandwidth()}
          fill="gray"
        />
      {/if}
      {#if d.start1 !== null}
        <rect
          x={xScale(d.start1)}
          y={yScale(d.name)}
          width={xScale(d.end1) - xScale(d.start1)}
          height={yScale.bandwidth()}
          fill="gray"
        />
      {/if}

      <text
        id={"text-" + d.name}
        x={xScale(d.established) - 8}
        y={yScale(d.name) + yScale.bandwidth() / 2}
        text-anchor="end"
        dominant-baseline="middle"
        font-size="14px"
        font-family="Montserrat"
        font-weight={linkedNames.has(d.name) ? "900" : "500"}
        fill="black"
      >
        {d.name}
      </text>
    {/each}
  </svg>

  <!-- gantt -->
  <!-- <svg {width} {height}>
    {#each tasks as task (task.id)}
      {#if task.start && task.end}
        <g transform={`translate(0, ${y(task.name)})`}>
          <line
            x1={10}
            x2={width - margin.right}
            y1={0}
            y2={0}
            stroke="#ccc"
            stroke-width="1"
          />
          <rect
            class="task"
            x={x(task.start)}
            y={0}
            fill="#595959"
            rx="3"
            width={Math.max(1, x(task.end) - x(task.start))}
            height={y.bandwidth()}
          />
          <line
            x1={10}
            x2={width - margin.right}
            y1={y.bandwidth()}
            y2={y.bandwidth()}
            stroke="#ccc"
            stroke-width="1"
          />
        </g>
      {/if}
    {/each}
    <rect
      class="task"
      x={x(parse("2027-07-01"))}
      y={262}
      fill="black"
      rx="3"
      width={Math.max(1, x(parse("2027-10-01")) - x(parse("2027-07-01")))}
      height={y.bandwidth()}
    />
    {#each tasks as task}
      <text
        x={20}
        y={y(task.name) + y.bandwidth() / 2.5}
        text-anchor="start"
        font-size="24"
        font-weight="800"
        class="y-label"
      >
        {#each wrapWords(task.name) as line, i}
          <tspan x={20} dy={i === 0 ? 0 : "1.2em"}>{line}</tspan>
        {/each}
      </text>
    {/each}
    <text
      x={800}
      y={height - 20}
      text-anchor="start"
      font-size="28"
      font-weight="800"
      class="y-label">Month</text
    >
    <text
      x={20}
      y={height - 30}
      text-anchor="start"
      font-size="20"
      font-weight="800"
      class="y-label">Secondment:</text
    >
    <rect
      class="task"
      x={135}
      y={height - 60}
      fill="black"
      rx="3"
      width={Math.max(1, x(parse("2027-09-01")) - x(parse("2027-06-01")))}
      height={y.bandwidth()}
    />

    <g
      class="x-axis"
      bind:this={xAxisG}
      transform={`translate(0, ${height - 80})`}
    />
  </svg> -->
</main>

<style>
  main {
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
    transform: translate(-50%, -100%); /* position above cursor */
  }
</style>
