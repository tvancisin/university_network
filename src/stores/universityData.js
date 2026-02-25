import { readable } from "svelte/store";
import * as d3 from "d3";
import {
    unis,
    links,
    universities_coordiantes,
    allowedOccupations,
    valid_uni_locations
} from "../utils";

function capitalizeWords(str) {
    return str.replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeLocationName(name) {
    if (!name) return null;

    let cleaned = name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

    cleaned = cleaned.replace(/^dublin\s+\d+$/, "dublin");

    // Handle city name variations
    const cityAliases = {
        "wien": "vienna",
        "geneve": "geneva",
        "genf": "geneva",
    };

    if (cityAliases[cleaned]) {
        cleaned = cityAliases[cleaned];
    }

    return cleaned;
}

function getLocationKey(location) {
    const normalized = normalizeLocationName(location.official_name);
    if (!normalized) return null;

    const country = location.country?.toLowerCase().trim() || "unknown";
    return `${normalized}|${country}`;
}

function addLocation(location, person, locationMap) {
    const locationKey = getLocationKey(location);
    if (!locationKey) return;

    if (!locationMap.has(locationKey)) {
        locationMap.set(locationKey, {
            location_name: capitalizeWords(normalizeLocationName(location.official_name)),
            country: location.country || "Unknown",
            latitude: location.latitude ?? null,
            longitude: location.longitude ?? null,
            people: new Map(),
        });
    }

    const locEntry = locationMap.get(locationKey);
    locEntry.people.set(person.id, person);
}

function collectLocations(people, occupations) {
    const locationMap = new Map();

    people.forEach((person) => {
        if (!person?.id) return;

        if (Array.isArray(person.other_universities)) {
            person.other_universities.forEach((entry) => {
                if (entry.location?.official_name) {
                    addLocation(entry.location, person, locationMap);
                }
            });
        }

        if (Array.isArray(person.floruit)) {
            person.floruit.forEach((entry) => {
                if (entry.location?.official_name && occupations.has(entry.occupation)) {
                    addLocation(entry.location, person, locationMap);
                }
            });
        }
    });

    return Array.from(locationMap.values()).map((loc) => ({
        location_name: loc.location_name,
        country: loc.country,
        latitude: loc.latitude,
        longitude: loc.longitude,
        people: Array.from(loc.people.values()),
    }));
}

function buildEnhancedLinks(otherUniversities) {
    const groupedMatches = unis.map((univ) => {
        const aliases = univ.aliases || [univ.name];
        const matchedPeople = otherUniversities.filter((person) =>
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

    const filteredMatches = groupedMatches.filter((group) => group.people.length);

    return links.map((link) => {
        const match = filteredMatches.find((m) => m.name === link.target.name);
        return {
            ...link,
            number: match ? match.people.length : undefined,
        };
    });
}

function buildMapData() {
    const uniLocations = [];
    const uniConnectionsLocations = [];
    const capitalsConnections = [];

    for (let i = 0; i < universities_coordiantes.length - 1; i++) {
        uniLocations.push({
            name: universities_coordiantes[i].name,
            latitude: +universities_coordiantes[i].lat,
            longitude: +universities_coordiantes[i].lon,
        });
    }

    for (let i = 0; i < universities_coordiantes.length; i++) {
        const uni = universities_coordiantes[i];
        const isTarget = links.some((link) => link.target.name === uni.name);

        if (isTarget || uni.name === "St Andrews") {
            uniConnectionsLocations.push({
                name: uni.name,
                latitude: +uni.lat,
                longitude: +uni.lon,
            });
        }
    }

    for (let y = 0; y < links.length - 1; y++) {
        capitalsConnections.push({
            start: links[y].source.name,
            end: links[y].target.name,
            num: 2,
        });
    }

    return { uniLocations, uniConnectionsLocations, capitalsConnections };
}

async function loadUniversityData() {
    const [universitiesJson, capitalsCsv, europeJson, otherUniFloruit] =
        await Promise.all([
            d3.json("universities.json"),
            d3.csv("capitals.csv"),
            d3.json("europe.json"),
            d3.json("all_other_uni_floruit.json"),
        ]);


    const allOtherUni = collectLocations(otherUniFloruit || [], allowedOccupations);
    const cleanedData = allOtherUni.filter(location =>
        valid_uni_locations.has(location.location_name)
    );
    console.log(cleanedData);
    


    const enhancedLinks = buildEnhancedLinks(universitiesJson || []);
    const features = europeJson?.features || [];
    const { uniLocations, uniConnectionsLocations, capitalsConnections } =
        buildMapData();

    return {
        cleanedData,
        enhancedLinks,
        features,
        uniLocations,
        uniConnectionsLocations,
        capitalsConnections,
        capitals: capitalsCsv || [],
        universities: universitiesJson || [],
    };
}

const initialState = {
    loading: true,
    error: null,
    data: null,
};

export const universityData = readable(initialState, (set) => {
    let cancelled = false;

    loadUniversityData()
        .then((data) => {
            if (cancelled) return;
            set({ loading: false, error: null, data });
        })
        .catch((error) => {
            if (cancelled) return;
            set({ loading: false, error, data: null });
        });

    return () => {
        cancelled = true;
    };
});
