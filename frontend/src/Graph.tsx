import { useEffect, useRef } from "react";
import * as d3 from "d3";
import type { FlowEvent } from "./types";

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  kind: "system" | "destination";
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  flow: FlowEvent;
}

interface GraphProps {
  flows: FlowEvent[];
  onSelectFlow: (flow: FlowEvent | null) => void;
  selectedFlowId: string | null;
}

const WIDTH = 900;
const HEIGHT = 560;

const NODE_COLOR = {
  system: "#3987e5",
  destination: "#d95926",
};

const PROTOCOL_COLOR: Record<string, string> = {
  TCP: "#199e70",
  UDP: "#9085e9",
};

function protocolColor(protocol: string): string {
  return PROTOCOL_COLOR[protocol] ?? "#6b7280";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Graph({ flows, onSelectFlow, selectedFlowId }: GraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const nodesRef = useRef<Map<string, GraphNode>>(new Map());

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const defs = svg.append("defs");

    // Soft glow filter for nodes and the selected flow.
    const glow = defs.append("filter").attr("id", "node-glow").attr("x", "-60%").attr("y", "-60%").attr("width", "220%").attr("height", "220%");
    glow.append("feGaussianBlur").attr("stdDeviation", 4).attr("result", "blur");
    const merge = glow.append("feMerge");
    merge.append("feMergeNode").attr("in", "blur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    for (const [protocol, color] of Object.entries({ ...PROTOCOL_COLOR, OTHER: "#6b7280" })) {
      defs
        .append("marker")
        .attr("id", `arrow-${protocol}`)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 24)
        .attr("refY", 0)
        .attr("markerWidth", 7)
        .attr("markerHeight", 7)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", color);
    }

    const linkGroup = svg.append("g").attr("class", "links");
    const nodeGroup = svg.append("g").attr("class", "nodes");
    const labelGroup = svg.append("g").attr("class", "labels");

    const simulation = d3
      .forceSimulation<GraphNode>([])
      .force("charge", d3.forceManyBody().strength(-280))
      .force("center", d3.forceCenter(WIDTH / 2, HEIGHT / 2))
      .force("collide", d3.forceCollide(48))
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphLink>([])
          .id((d) => d.id)
          .distance(170)
      )
      .on("tick", () => {
        linkGroup
          .selectAll<SVGLineElement, GraphLink>("line")
          .attr("x1", (d) => (d.source as GraphNode).x ?? 0)
          .attr("y1", (d) => (d.source as GraphNode).y ?? 0)
          .attr("x2", (d) => (d.target as GraphNode).x ?? 0)
          .attr("y2", (d) => (d.target as GraphNode).y ?? 0);

        nodeGroup
          .selectAll<SVGGElement, GraphNode>("g.node")
          .attr("transform", (d) => `translate(${d.x ?? 0}, ${d.y ?? 0})`);

        labelGroup
          .selectAll<SVGTextElement, GraphNode>("text")
          .attr("x", (d) => d.x ?? 0)
          .attr("y", (d) => (d.y ?? 0) - (d.kind === "system" ? 34 : 24));
      });

    simulationRef.current = simulation;

    return () => {
      simulation.stop();
    };
  }, []);

  useEffect(() => {
    const simulation = simulationRef.current;
    if (!simulation || !svgRef.current) return;

    const nodes = nodesRef.current;
    const seenIds = new Set<string>();

    for (const flow of flows) {
      if (!nodes.has(flow.source)) {
        nodes.set(flow.source, {
          id: flow.source,
          kind: "system",
          x: WIDTH / 2 + (Math.random() - 0.5) * 100,
          y: HEIGHT / 2 + (Math.random() - 0.5) * 100,
        });
      }
      if (!nodes.has(flow.destination)) {
        nodes.set(flow.destination, {
          id: flow.destination,
          kind: "destination",
          x: WIDTH / 2 + (Math.random() - 0.5) * 400,
          y: HEIGHT / 2 + (Math.random() - 0.5) * 400,
        });
      }
      seenIds.add(flow.source);
      seenIds.add(flow.destination);
    }

    for (const id of Array.from(nodes.keys())) {
      if (!seenIds.has(id)) nodes.delete(id);
    }

    const nodeList = Array.from(nodes.values());
    const links: GraphLink[] = flows.map((flow) => ({
      source: flow.source,
      target: flow.destination,
      flow,
    }));

    const svg = d3.select(svgRef.current);
    const maxBytes = Math.max(1, ...flows.map((f) => f.bytes));

    // --- links ---
    const linkSelection = svg
      .select<SVGGElement>("g.links")
      .selectAll<SVGLineElement, GraphLink>("line")
      .data(links, (d) => d.flow.id);

    linkSelection
      .enter()
      .append("line")
      .attr("stroke-linecap", "round")
      .merge(linkSelection as any)
      .attr("stroke", (d) => protocolColor(d.flow.protocol))
      .attr("stroke-opacity", (d) => (selectedFlowId && d.flow.id !== selectedFlowId ? 0.25 : 0.85))
      .attr("stroke-width", (d) => 1.5 + (d.flow.bytes / maxBytes) * 5)
      .attr("marker-end", (d) => `url(#arrow-${PROTOCOL_COLOR[d.flow.protocol] ? d.flow.protocol : "OTHER"})`)
      .style("cursor", "pointer")
      .on("click", (_event, d) => onSelectFlow(d.flow))
      .each(function (d) {
        d3.select(this).select("title").remove();
        d3.select(this)
          .append("title")
          .text(`${d.flow.source} → ${d.flow.destination} (${d.flow.protocol}) · ${formatBytes(d.flow.bytes)}`);
      });

    linkSelection.exit().remove();

    // --- nodes ---
    const nodeSelection = svg
      .select<SVGGElement>("g.nodes")
      .selectAll<SVGGElement, GraphNode>("g.node")
      .data(nodeList, (d) => d.id);

    const nodeEnter = nodeSelection
      .enter()
      .append("g")
      .attr("class", "node")
      .call(
        d3
          .drag<SVGGElement, GraphNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    nodeEnter
      .append("circle")
      .attr("class", "halo")
      .attr("r", (d) => (d.kind === "system" ? 30 : 19))
      .attr("fill", (d) => NODE_COLOR[d.kind])
      .attr("opacity", 0.15);

    nodeEnter
      .append("circle")
      .attr("class", "core")
      .attr("r", (d) => (d.kind === "system" ? 20 : 12))
      .attr("fill", (d) => NODE_COLOR[d.kind])
      .attr("stroke", "#0d0f14")
      .attr("stroke-width", 2)
      .attr("filter", "url(#node-glow)");

    nodeEnter.merge(nodeSelection as any);
    nodeSelection.exit().remove();

    // --- labels ---
    const labelSelection = svg
      .select<SVGGElement>("g.labels")
      .selectAll<SVGTextElement, GraphNode>("text")
      .data(nodeList, (d) => d.id);

    labelSelection
      .enter()
      .append("text")
      .attr("text-anchor", "middle")
      .attr("font-size", 11)
      .attr("font-weight", 600)
      .attr("fill", "#e2e8f0")
      .style("pointer-events", "none")
      .style("paint-order", "stroke")
      .style("stroke", "#0d0f14")
      .style("stroke-width", "3px")
      .merge(labelSelection as any)
      .text((d) => d.id);

    labelSelection.exit().remove();

    simulation.nodes(nodeList);
    (simulation.force("link") as d3.ForceLink<GraphNode, GraphLink>).links(links);
    simulation.alpha(0.6).restart();
  }, [flows, onSelectFlow, selectedFlowId]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      height="100%"
      style={{ display: "block" }}
    />
  );
}
