"use client";

import { Badge, Box, Heading, Stack, Text } from "@chakra-ui/react";
import { useDashboard, when } from "@/components/dashboard-context";
import { GlassCard, PageHeader } from "@/components/dashboard-ui";

export default function LogsPage() {
  const { state } = useDashboard();
  const runs = [...(state?.generator_logs || [])].reverse();
  return <>
    <PageHeader eyebrow="Diagnostics" title="Generator logs" description="Each generation attempt is saved as a dated entry. Expand a row to review its progress and outcome." />
    <Stack gap="3">
      {runs.length ? runs.map((run, i) => {
        let details = [];
        try { details = JSON.parse(run.details || "[]"); } catch { details = []; }
        return <GlassCard key={`${run.started_at}-${i}`} p="0" overflow="hidden">
          <Box as="details" p={{ base: "4", md: "5" }}>
            <Box as="summary" cursor="pointer" listStylePosition="inside">
              <Badge colorPalette={run.result === "success" ? "green" : run.result === "running" ? "cyan" : "red"} ml="2">{run.result}</Badge>
              <Text as="span" color="gray.100" fontWeight="700" ml="3">{when(run.started_at)}</Text>
              <Text as="span" color="gray.400" fontSize="sm" ml="3">{run.source} · finished {when(run.finished_at)}</Text>
            </Box>
            <Stack mt="5" pl={{ base: "2", md: "7" }} gap="2">
              {details.map((line, index) => <Text key={index} color="gray.300" fontSize="sm" fontFamily="mono">{line}</Text>)}
              {!details.length && <Text color="gray.400">No diagnostic details were recorded.</Text>}
            </Stack>
          </Box>
        </GlassCard>;
      }) : <GlassCard p="6"><Heading color="gray.100" size="md">No generator runs yet</Heading><Text color="gray.400" mt="2">A dated log will appear here after the next generation attempt.</Text></GlassCard>}
    </Stack>
  </>;
}
