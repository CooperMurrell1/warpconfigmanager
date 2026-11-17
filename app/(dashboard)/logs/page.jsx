"use client";

import { Badge, Box, Button, Flex, Heading, HStack, Stack, Text } from "@chakra-ui/react";
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
              <Flex align="center" justify="space-between" gap="4">
                <HStack flexWrap="wrap" gap="2">
                  <Badge colorPalette={run.result === "success" ? "green" : run.result === "running" ? "cyan" : "red"}>{run.result}</Badge>
                  <Text color="gray.100" fontWeight="700">{when(run.started_at)}</Text>
                  <Text color="gray.400" fontSize="sm">{run.source} · finished {when(run.finished_at)}</Text>
                </HStack>
                <Button asChild aria-label="Download this generator log" title="Download log" size="sm" minW="9" p="0" variant="outline" color="gray.100" borderColor="whiteAlpha.300" flexShrink="0">
                  <a href={`/api/generator-logs?started_at=${encodeURIComponent(run.started_at)}`} download onClick={event => event.stopPropagation()}>
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m-5-5 5 5 5-5" /><path d="M5 18v3h14v-3" /></svg>
                  </a>
                </Button>
              </Flex>
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
