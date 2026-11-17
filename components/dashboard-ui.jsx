"use client";

import { Badge, Box, Heading, Text } from "@chakra-ui/react";

export function GlassCard({ children, ...props }) {
  return (
    <Box
      bg="rgba(15, 23, 42, 0.68)"
      borderWidth="1px"
      borderColor="rgba(148, 163, 184, 0.18)"
      boxShadow="0 18px 48px rgba(0, 0, 0, 0.24)"
      backdropFilter="blur(18px)"
      rounded="2xl"
      color="gray.100"
      {...props}
    >
      {children}
    </Box>
  );
}

export function PageHeader({ eyebrow, title, description, action }) {
  return (
    <Box display="flex" flexDirection={{ base: "column", md: "row" }} alignItems={{ md: "end" }} justifyContent="space-between" gap="4" mb="7">
      <Box>
        <Text color="cyan.300" fontSize="xs" fontWeight="800" letterSpacing="0.18em" textTransform="uppercase">{eyebrow}</Text>
        <Heading color="gray.50" size={{ base: "xl", md: "2xl" }} mt="2">{title}</Heading>
        {description && <Text color="gray.300" mt="2" maxW="3xl">{description}</Text>}
      </Box>
      {action}
    </Box>
  );
}

export function StatusBadge({ status }) {
  const normalized = (status || "loading").toLowerCase();
  const palette = normalized === "failed" ? "red" : normalized === "running" ? "yellow" : normalized === "loading" ? "gray" : "teal";
  return <Badge colorPalette={palette} variant="solid" rounded="full" px="3" py="1">{status || "Loading"}</Badge>;
}

export function Detail({ label, children }) {
  return (
    <Box minW="0">
      <Text color="gray.400" fontSize="xs" fontWeight="700" letterSpacing="0.08em" textTransform="uppercase">{label}</Text>
      <Text color="gray.100" mt="1" overflowWrap="anywhere">{children ?? "Not available"}</Text>
    </Box>
  );
}
