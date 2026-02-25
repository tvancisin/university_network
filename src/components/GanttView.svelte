<script>
  import * as d3 from "d3";
  import { onMount } from "svelte";

  export let width = 0;
  export let barHeight = 0;
  export let margin = { top: 10, right: 30, bottom: 25, left: 100 };
  export let enhancedLinks = [];
  export let unis = [];
  export let links = [];

  let xAxisGroup;
  let textWidths = {};

  $: xScale = d3
    .scaleLinear()
    .domain([1000, 2000])
    .range([width / 3, width - margin.right]);

  $: yScale = d3
    .scaleBand()
    .domain(unis.map((d) => d.name))
    .range([margin.top, barHeight - margin.bottom])
    .padding(0.2);

  $: if (xAxisGroup) {
    const xAxis = d3.axisBottom(xScale);
    xAxis.tickFormat(d3.format("~d"));

    d3.select(xAxisGroup)
      .call(xAxis)
      .selectAll("text")
      .style("font-size", "12px")
      .style("font-weight", 600);
  }

  $: linkedNames = new Set(
    (links || []).flatMap((link) => [link.source.name, link.target.name]),
  );

  let scalePath = d3.scaleLinear().domain([1, 3000]).range([1, 10]);

  onMount(() => {
    unis.forEach((d) => {
      const el = document.getElementById(`text-${d.name}`);
      if (el) textWidths[d.name] = el.getBBox().width;
    });
  });

  function getTextShift(name) {
    return textWidths[name] ? textWidths[name] + 15 : 10;
  }

  function generatePath(link) {
    const shiftTarget = getTextShift(link.target.name);
    const shiftSource = getTextShift(link.source.name);

    const x1 = xScale(link.source.est) - shiftSource;
    const y1 = yScale(link.source.name) + 8;
    const x2 = xScale(link.target.est) - shiftTarget;
    const y2 = yScale(link.target.name) + 8;

    const dy = Math.abs(y2 - y1);
    const bulge = Math.max(30, dy * 0.9);

    return `
    M ${x1},${y1}
    C ${x1 - bulge},${y1}
      ${x2 - bulge},${y2}
      ${x2},${y2}
  `;
  }
</script>

<svg {width} height={barHeight}>
  <g
    bind:this={xAxisGroup}
    transform={`translate(0, ${barHeight - margin.bottom + 1})`}
  />
  {#each enhancedLinks as link}
    <path
      d={generatePath(link)}
      stroke="gray"
      fill="none"
      stroke-width={scalePath(5)}
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
