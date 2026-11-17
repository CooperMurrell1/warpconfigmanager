"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Box, Button, Heading, HStack, Input, SimpleGrid, Spinner, Stack, Text } from "@chakra-ui/react";
import { GlassCard, PageHeader } from "@/components/dashboard-ui";

const PAGE_SIZE = 10;
const columns = [
  ["Name", user => user.Name || ""],
  ["User ID", user => user.Id || ""],
  ["Role", user => user.Policy?.IsAdministrator ? "Administrator" : "User"],
  ["Last login", user => user.LastLoginDate || ""],
  ["Last activity", user => user.LastActivityDate || ""],
];

function formatDate(value) {
  if (!value) return "Never";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
}

function display(value) {
  if (value === null || value === undefined || value === "") return "Not available";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${display(item)}`).join(", ");
  return String(value);
}

export default function AccountsPage() {
  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [sortKey, setSortKey] = useState("Name");
  const [sortDirection, setSortDirection] = useState("asc");
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/users", { cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load users");
        return data.users;
      })
      .then(data => {
        if (!active) return;
        setUsers(data);
        setSelectedId(data[0]?.Id || "");
      })
      .catch(reason => active && setError(reason.message || "Could not load users"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return users.filter(user => !needle || [user.Name, user.Id, user.Policy?.IsAdministrator ? "administrator" : "user"]
      .some(value => String(value || "").toLocaleLowerCase().includes(needle)));
  }, [users, query]);

  const sorted = useMemo(() => {
    const column = columns.find(([key]) => key === sortKey) || columns[0];
    return [...filtered].sort((a, b) => {
      const result = String(column[1](a)).localeCompare(String(column[1](b)), undefined, { numeric: true, sensitivity: "base" });
      return sortDirection === "asc" ? result : -result;
    });
  }, [filtered, sortKey, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleUsers = sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const selected = users.find(user => user.Id === selectedId) || visibleUsers[0] || null;

  function sortBy(key) {
    if (sortKey === key) setSortDirection(direction => direction === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDirection("asc"); }
    setPage(0);
  }

  return <>
    <PageHeader eyebrow="Administration" title="Accounts" description="Jellyfin users and account details." />
    {error && <Alert.Root status="error" mb="5" rounded="xl" bg="rgba(127, 29, 29, 0.55)" color="red.50"><Alert.Indicator /><Alert.Title>{error}</Alert.Title></Alert.Root>}

    <SimpleGrid columns={{ base: 1, lg: 4 }} gap="5" alignItems="start">
      <GlassCard gridColumn={{ base: "auto", lg: "span 3" }} minW="0" p={{ base: "4", md: "6" }}>
        <HStack justify="space-between" align="center" mb="5" flexWrap="wrap" gap="3">
          <Box><Heading color="gray.50" size="md">All users</Heading><Text color="gray.300" fontSize="sm" mt="1">{filtered.length} {filtered.length === 1 ? "account" : "accounts"}</Text></Box>
          <Input aria-label="Search accounts" placeholder="Search users…" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} maxW={{ base: "full", sm: "64" }} bg="rgba(2, 6, 23, 0.68)" borderColor="rgba(148, 163, 184, 0.3)" color="gray.50" _placeholder={{ color: "gray.400" }} />
        </HStack>
        <Box overflowX="auto" borderWidth="1px" borderColor="rgba(148, 163, 184, 0.2)" rounded="xl">
          <Box as="table" w="full" minW="700px" borderCollapse="collapse" fontSize="sm">
            <Box as="thead" bg="rgba(2, 6, 23, 0.62)"><Box as="tr">
              {columns.map(([key]) => <Box as="th" key={key} px="3" py="3" textAlign="left" borderBottomWidth="1px" borderColor="rgba(148, 163, 184, 0.2)">
                <Button variant="ghost" size="sm" px="1" color="gray.200" onClick={() => sortBy(key)} aria-label={`Sort by ${key}`} _hover={{ bg: "whiteAlpha.100", color: "cyan.100" }}>{key}{sortKey === key ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}</Button>
              </Box>)}
            </Box></Box>
            <Box as="tbody">
              {loading ? <Box as="tr"><Box as="td" colSpan={columns.length} px="4" py="8" textAlign="center"><Spinner color="cyan.300" /><Text color="gray.300" mt="2">Loading users…</Text></Box></Box>
                : visibleUsers.map(user => <Box as="tr" key={user.Id} tabIndex={0} aria-selected={selected?.Id === user.Id} onClick={() => setSelectedId(user.Id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") setSelectedId(user.Id); }} cursor="pointer" bg={selected?.Id === user.Id ? "rgba(8, 145, 178, 0.2)" : "transparent"} _hover={{ bg: selected?.Id === user.Id ? "rgba(8, 145, 178, 0.2)" : "rgba(148, 163, 184, 0.1)" }}>
                  <Box as="td" px="4" py="3" borderBottomWidth="1px" borderColor="rgba(148, 163, 184, 0.14)" color="gray.50" fontWeight="semibold">{user.Name || "Unnamed user"}</Box>
                  <Box as="td" px="4" py="3" borderBottomWidth="1px" borderColor="rgba(148, 163, 184, 0.14)" color="gray.300" fontFamily="mono" fontSize="xs">{user.Id}</Box>
                  <Box as="td" px="4" py="3" borderBottomWidth="1px" borderColor="rgba(148, 163, 184, 0.14)"><Badge colorPalette={user.Policy?.IsAdministrator ? "cyan" : "gray"}>{user.Policy?.IsAdministrator ? "Admin" : "User"}</Badge></Box>
                  <Box as="td" px="4" py="3" borderBottomWidth="1px" borderColor="rgba(148, 163, 184, 0.14)" color="gray.300">{formatDate(user.LastLoginDate)}</Box>
                  <Box as="td" px="4" py="3" borderBottomWidth="1px" borderColor="rgba(148, 163, 184, 0.14)" color="gray.300">{formatDate(user.LastActivityDate)}</Box>
                </Box>)}
              {!loading && visibleUsers.length === 0 && <Box as="tr"><Box as="td" colSpan={columns.length} px="4" py="8" textAlign="center" color="gray.300">No matching users.</Box></Box>}
            </Box>
          </Box>
        </Box>
        <HStack justify="space-between" mt="4" flexWrap="wrap" gap="3">
          <Text color="gray.300" fontSize="sm">{sorted.length ? `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, sorted.length)} of ${sorted.length}` : "0 users"}</Text>
          <HStack>
            <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} borderColor="whiteAlpha.300" color="gray.100" _hover={{ bg: "whiteAlpha.100" }}>Previous</Button>
            <Text color="gray.200" fontSize="sm" px="2">Page {currentPage + 1} of {pageCount}</Text>
            <Button variant="outline" size="sm" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)} borderColor="whiteAlpha.300" color="gray.100" _hover={{ bg: "whiteAlpha.100" }}>Next</Button>
          </HStack>
        </HStack>
      </GlassCard>

      <GlassCard minW="0" p={{ base: "4", md: "5" }}>
        <Heading color="gray.50" size="md" mb="1">User information</Heading>
        <Text color="gray.300" fontSize="sm" mb="5">{selected?.Name || "Select an account"}</Text>
        {selected ? <Stack gap="4">
          <SimpleGrid columns={2} gap="3">
            <Box><Text color="gray.400" fontSize="xs" fontWeight="700">ROLE</Text><Badge mt="1" colorPalette={selected.Policy?.IsAdministrator ? "cyan" : "gray"}>{selected.Policy?.IsAdministrator ? "Administrator" : "User"}</Badge></Box>
            <Box><Text color="gray.400" fontSize="xs" fontWeight="700">STATUS</Text><Text mt="1" color={selected.Policy?.IsDisabled ? "orange.200" : "cyan.200"}>{selected.Policy?.IsDisabled ? "Disabled" : "Enabled"}</Text></Box>
          </SimpleGrid>
          <Stack gap="3">
            {[["User ID", selected.Id], ["Server ID", selected.ServerId], ["Last login", formatDate(selected.LastLoginDate)], ["Last activity", formatDate(selected.LastActivityDate)], ["Created", formatDate(selected.DateCreated)], ["Has password", selected.HasPassword], ["Has configured password", selected.HasConfiguredPassword], ["Primary image tag", selected.PrimaryImageTag], ["Configuration", selected.Configuration], ["Policy", selected.Policy]].map(([label, value]) => <Box key={label} borderTopWidth="1px" borderColor="rgba(148, 163, 184, 0.16)" pt="2">
              <Text color="gray.400" fontSize="xs" fontWeight="700" mb="1">{label}</Text><Text color="gray.100" fontSize="sm" overflowWrap="anywhere">{display(value)}</Text>
            </Box>)}
          </Stack>
        </Stack> : <Text color="gray.300">Select an account to view its details.</Text>}
      </GlassCard>
    </SimpleGrid>
    <Text color="gray.500" fontSize="sm" mt="5">Account information comes from Jellyfin. Passwords and authentication tokens are never displayed.</Text>
  </>;
}
