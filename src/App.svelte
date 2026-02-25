<script>
  import { unis, links } from "./utils";
  import { universityData } from "./stores/universityData";
  import MapView from "./components/MapView.svelte";
  import GanttView from "./components/GanttView.svelte";
  import LeafletCircles from "./components/LeafletCircles.svelte";

  let width = 400,
    height = 500,
    bar_height = 2000,
    enhancedLinks = [],
    features = [],
    uni_locations = [],
    uni_connections_locations = [],
    capitals_connections_object = [],
    all_other_uni = [];

  $: {
    const data = $universityData.data;
    enhancedLinks = data?.enhancedLinks ?? [];
    features = data?.features ?? [];
    all_other_uni = data?.cleanedData ?? [];
    uni_locations = data?.uniLocations ?? [];
    uni_connections_locations = data?.uniConnectionsLocations ?? [];
    capitals_connections_object = data?.capitalsConnections ?? [];
  }

  // -----------------------------------------------------
</script>

<main bind:clientWidth={width} bind:clientHeight={height}>
  <!-- map -->
  <!-- <MapView
    {width}
    {height}
    {features}
    uniLocations={uni_locations}
    uniConnectionsLocations={uni_connections_locations}
    capitalsConnections={capitals_connections_object}
  /> -->

  <!-- gantt -->
  <!-- <GanttView
    {width}
    barHeight={bar_height}
    {enhancedLinks}
    {unis}
    {links}
  /> -->

  <!-- leaflet map -->
  <LeafletCircles locations={all_other_uni} mapHeight={height} />
</main>

<style>
  main {
    width: 100%;
    height: 100vh;
  }
</style>
