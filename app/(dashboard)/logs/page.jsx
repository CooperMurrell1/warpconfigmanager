"use client";

import { Badge, Box, Button, Flex, Heading, HStack, Input, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { useDashboard, when } from "@/components/dashboard-context";
import { GlassCard, PageHeader } from "@/components/dashboard-ui";

function DownloadGlyph() {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m-5-5 5 5 5-5" /><path d="M5 18v3h14v-3" /></svg>;
}

const typeLabels = { generator: "Generator", config: "Config change", service: "Service" };
const typeColors = { generator: "cyan", config: "purple", service: "gray" };

export default function LogsPage() {
  const { state } = useDashboard();
  const [typeFilter, setTypeFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const entries = useMemo(() => {
    const generator = (state?.generator_logs || []).map(item => {
      let details = [];
      try { details = JSON.parse(item.details || "[]"); } catch {}
      return { type: "generator", at: item.started_at, finishedAt: item.finished_at, result: item.result, source: item.source, title: `${item.source} config generation`, details, download: `/api/logs/download?kind=generator&started_at=${encodeURIComponent(item.started_at)}` };
    });
    const completedRuns = new Set(generator.map(item => item.at));
    const service = (state?.logs || [])
      .filter(item => item.category !== "generator" || !completedRuns.has(item.at))
      .map(item => ({
      type: item.category === "config" || item.category === "generator" ? item.category : "service",
      at: item.at,
      result: item.level,
      title: item.message,
      details: [item.message],
      download: `/api/logs/download?kind=event&id=${item.id}`,
    }));
    const query = search.trim().toLocaleLowerCase();
    return [...generator, ...service]
      .filter(item => typeFilter === "all" || item.type === typeFilter)
      .filter(item => resultFilter === "all" || item.result === resultFilter)
      .filter(item => !query || `${item.title} ${item.source || ""} ${item.details.join(" ")}`.toLocaleLowerCase().includes(query))
      .sort((a, b) => {
        const diff = new Date(a.at).getTime() - new Date(b.at).getTime();
        return sortOrder === "oldest" ? diff : -diff;
      });
  }, [state?.generator_logs, state?.logs, typeFilter, resultFilter, sortOrder, search]);
  const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
  const visibleEntries = entries.slice((page - 1) * pageSize, page * pageSize);

  return <>
    <PageHeader eyebrow="Diagnostics" title="Logs" description="Browse generator runs, config changes, and service events. Expand or download any entry." />
    <GlassCard p={{ base: "4", md: "5" }} mb="4">
      <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} gap="3">
        <Box as="select" aria-label="Filter logs by type" value={typeFilter} onChange={event => setTypeFilter(event.target.value)} h="10" px="3" rounded="lg" bg="#0b1424" color="gray.100" borderWidth="1px" borderColor="whiteAlpha.300">
          <option value="all">All log types</option><option value="generator">Generator</option><option value="config">Config changes</option><option value="service">Service</option>
        </Box>
        <Box as="select" aria-label="Filter logs by result or level" value={resultFilter} onChange={event => setResultFilter(event.target.value)} h="10" px="3" rounded="lg" bg="#0b1424" color="gray.100" borderWidth="1px" borderColor="whiteAlpha.300">
          <option value="all">All results and levels</option><option value="success">Success</option><option value="running">Running</option><option value="failed">Failed</option><option value="info">Info</option><option value="warning">Warning</option><option value="error">Error</option>
        </Box>
        <Box as="select" aria-label="Sort logs by date" value={sortOrder} onChange={event => setSortOrder(event.target.value)} h="10" px="3" rounded="lg" bg="#0b1424" color="gray.100" borderWidth="1px" borderColor="whiteAlpha.300">
          <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
        </Box>
        <Input aria-label="Search logs" placeholder="Search log messages" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} bg="rgba(2,6,23,.68)" borderColor="whiteAlpha.300" color="gray.100" _placeholder={{ color: "gray.500" }} />
        <Box as="select" aria-label="Logs per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }} h="10" px="3" rounded="lg" bg="#0b1424" color="gray.100" borderWidth="1px" borderColor="whiteAlpha.300"><option value="10">10 per page</option><option value="20">20 per page</option><option value="50">50 per page</option><option value="100">100 per page</option></Box>
      </SimpleGrid>
    </GlassCard>

    <Stack gap="3">
      {visibleEntries.length ? visibleEntries.map((entry, index) => {
        const resultColor = entry.result === "success" || entry.result === "info" ? "green" : entry.result === "running" ? "cyan" : entry.result === "warning" ? "orange" : "red";
        return <GlassCard key={`${entry.type}-${entry.at}-${index}`} p="0" overflow="hidden">
          <Box as="details" p={{ base: "4", md: "5" }}>
            <Box as="summary" cursor="pointer" listStylePosition="inside">
              <Flex align="center" justify="space-between" gap="4">
                <HStack flexWrap="wrap" gap="2" minW="0">
                  <Badge colorPalette={typeColors[entry.type]}>{typeLabels[entry.type]}</Badge>
                  <Badge colorPalette={resultColor}>{entry.result}</Badge>
                  <Text color="gray.100" fontWeight="700">{when(entry.at)}</Text>
                  <Text color="gray.300" fontSize="sm" overflowWrap="anywhere">{entry.title}</Text>
                  {entry.finishedAt && <Text color="gray.500" fontSize="xs">Finished {when(entry.finishedAt)}</Text>}
                </HStack>
                <Button asChild aria-label="Download this log" title="Download log" size="sm" minW="9" p="0" variant="outline" color="gray.100" borderColor="whiteAlpha.300" flexShrink="0">
                  <a href={entry.download} download onClick={event => event.stopPropagation()}><DownloadGlyph /></a>
                </Button>
              </Flex>
            </Box>
            <Stack mt="5" pl={{ base: "2", md: "7" }} gap="2">
              {entry.details.map((line, lineIndex) => <Text key={lineIndex} color="gray.300" fontSize="sm" fontFamily="mono" overflowWrap="anywhere">{line}</Text>)}
              {!entry.details.length && <Text color="gray.400">No diagnostic details were recorded.</Text>}
            </Stack>
          </Box>
        </GlassCard>;
      }) : <GlassCard p="6"><Heading color="gray.100" size="md">No matching logs</Heading><Text color="gray.400" mt="2">Change the filters or wait for another event to be recorded.</Text></GlassCard>}
    </Stack>
    {entries.length > 0 && <Flex mt="5" align="center" justify="space-between" gap="3" wrap="wrap"><Text color="gray.400" fontSize="sm">Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, entries.length)} of {entries.length}</Text><HStack><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</Button><Text color="gray.300" fontSize="sm">Page {page} of {pageCount}</Text><Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>Next</Button></HStack></Flex>}
  </>;
}
