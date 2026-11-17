"use client";

import { useMemo, useState } from "react";
import { Badge, Box, Button, Input, SimpleGrid } from "@chakra-ui/react";
import { useDashboard, when } from "@/components/dashboard-context";
import { GlassCard, PageHeader } from "@/components/dashboard-ui";
import { DashboardTable } from "@/components/dashboard-table";

const typeLabels = { generator: "Generator", config: "Config change", service: "Service" };
const typeColors = { generator: "cyan", config: "purple", service: "gray" };

function diagnosticLines(value) {
  if (Array.isArray(value)) return value.filter(line => line != null && String(line).trim()).map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(line => line != null && String(line).trim()).map(String);
    } catch {}
  }
  return [];
}

function DownloadGlyph() {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m-5-5 5 5 5-5" /><path d="M5 18v3h14v-3" /></svg>;
}

export default function LogsPage() {
  const { state } = useDashboard();
  const [typeFilter, setTypeFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");
  const [search, setSearch] = useState("");

  const entries = useMemo(() => {
    const generator = (state?.generator_logs || []).map(item => {
      const details = diagnosticLines(item.details);
      if (!details.length) details.push(`Source: ${item.source}`, `Result: ${item.result}`, `Started: ${item.started_at}`, `Finished: ${item.finished_at || "Not recorded"}`, "Detailed generator output was not retained for this run.");
      return { key: `generator-${item.started_at}`, type: "generator", at: item.started_at, finishedAt: item.finished_at, result: item.result, source: item.source, title: `${item.source} config generation`, details, download: `/api/logs/download?kind=generator&started_at=${encodeURIComponent(item.started_at)}` };
    });
    const completedRuns = new Set(generator.map(item => item.at));
    const service = (state?.logs || [])
      .filter(item => item.category !== "generator" || !completedRuns.has(item.at))
      .map(item => {
        const messageLines = String(item.message || "").split(/\r?\n/);
        const details = diagnosticLines(item.details);
        if (!details.length) details.push(...messageLines.slice(1).filter(Boolean));
        if (!details.length) details.push(`Type: ${typeLabels[item.category] || "Service"}`, `Severity: ${item.level || "unknown"}`, `Recorded: ${item.at}`, `Event: ${messageLines[0] || "No message was recorded."}`, "This entry predates structured diagnostics.");
        return {
          key: `service-${item.id || `${item.at}-${messageLines[0]}`}`,
          type: item.category === "config" || item.category === "generator" ? item.category : "service",
          at: item.at,
          result: item.level,
          title: messageLines[0],
          details,
          download: `/api/logs/download?kind=event&id=${item.id}`,
        };
      });
    const query = search.trim().toLocaleLowerCase();
    return [...generator, ...service]
      .filter(item => typeFilter === "all" || item.type === typeFilter)
      .filter(item => resultFilter === "all" || item.result === resultFilter)
      .filter(item => !query || `${item.title} ${item.source || ""} ${item.details.join(" ")}`.toLocaleLowerCase().includes(query));
  }, [state?.generator_logs, state?.logs, typeFilter, resultFilter, search]);

  const columns = useMemo(() => [
    { key: "type", label: "Type", sortValue: entry => typeLabels[entry.type] || entry.type, render: entry => <Badge colorPalette={typeColors[entry.type]}>{typeLabels[entry.type]}</Badge> },
    { key: "result", label: "Result", sortValue: entry => entry.result || "", render: entry => {
      const color = entry.result === "success" || entry.result === "info" ? "green" : entry.result === "running" ? "cyan" : entry.result === "warning" ? "orange" : "red";
      return <Badge colorPalette={color}>{entry.result || "Unknown"}</Badge>;
    } },
    { key: "at", label: "Date", sortValue: entry => new Date(entry.at).getTime() || 0, render: entry => when(entry.at) },
    { key: "title", label: "Event", sortValue: entry => entry.title, render: entry => <Box minW="48"><Box color="gray.100" fontWeight="700">{entry.title}</Box>{entry.finishedAt && <Box color="gray.500" fontSize="xs" mt="1">Finished {when(entry.finishedAt)}</Box>}</Box> },
    { key: "details", label: "Details", sortValue: entry => entry.details.join(" "), render: entry => entry.details.length ? <Box as="details" maxW="sm"><Box as="summary" color="cyan.200" cursor="pointer">View details ({entry.details.length})</Box><Box mt="2" color="gray.300" fontFamily="mono" fontSize="xs" whiteSpace="pre-wrap" overflowWrap="anywhere">{entry.details.join("\n")}</Box></Box> : <Box color="gray.500">None</Box> },
    { key: "download", label: "Log file", sortValue: entry => entry.download, render: entry => <Button asChild size="sm" variant="outline" minW="9" px="2" color="gray.100" bg="rgba(15,23,42,.55)" borderColor="whiteAlpha.300" _hover={{ bg: "whiteAlpha.100" }} aria-label="Download this log" title="Download log"><a href={entry.download} download><DownloadGlyph /></a></Button> },
  ], []);

  return <>
    <PageHeader eyebrow="Diagnostics" title="Logs" description="Generation and service events." />
    <GlassCard p={{ base: "4", md: "5" }} mb="4">
      <SimpleGrid columns={{ base: 1, sm: 2, xl: 3 }} gap="3">
        <Box as="select" aria-label="Filter logs by type" value={typeFilter} onChange={event => setTypeFilter(event.target.value)} h="10" px="3" rounded="lg" bg="#0b1424" color="gray.100" borderWidth="1px" borderColor="whiteAlpha.300">
          <option value="all">All log types</option><option value="generator">Generator</option><option value="config">Config changes</option><option value="service">Service</option>
        </Box>
        <Box as="select" aria-label="Filter logs by result or level" value={resultFilter} onChange={event => setResultFilter(event.target.value)} h="10" px="3" rounded="lg" bg="#0b1424" color="gray.100" borderWidth="1px" borderColor="whiteAlpha.300">
          <option value="all">All results and levels</option><option value="success">Success</option><option value="running">Running</option><option value="failed">Failed</option><option value="info">Info</option><option value="warning">Warning</option><option value="error">Error</option>
        </Box>
        <Input aria-label="Search logs" placeholder="Search log messages" value={search} onChange={event => setSearch(event.target.value)} bg="rgba(2,6,23,.68)" borderColor="whiteAlpha.300" color="gray.100" _placeholder={{ color: "gray.400" }} />
      </SimpleGrid>
    </GlassCard>
    <GlassCard p={{ base: "3", md: "5" }}>
      <DashboardTable rows={entries} columns={columns} rowKey={entry => entry.key} initialSort="at" initialDirection="desc" pageSize={20} pageSizeOptions={[10, 20, 50, 100]} pageResetKey={`${typeFilter}:${resultFilter}:${search}`} emptyMessage="No matching logs." />
    </GlassCard>
  </>;
}
