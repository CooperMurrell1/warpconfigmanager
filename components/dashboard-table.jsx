"use client";

import { useEffect, useMemo, useState } from "react";
import { Box, Button, HStack, Text } from "@chakra-ui/react";

export function DashboardTable({ rows, columns, rowKey, initialSort, initialDirection = "asc", pageSize = 10, pageSizeOptions = [10, 20, 50], onRowClick, selectedKey, pageResetKey, emptyMessage = "No matching records." }) {
  const [sortKey, setSortKey] = useState(initialSort || columns[0]?.key || "");
  const [sortDirection, setSortDirection] = useState(initialDirection);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(pageSize);

  const sortedRows = useMemo(() => {
    const column = columns.find(item => item.key === sortKey) || columns[0];
    if (!column) return rows;
    return [...rows].sort((a, b) => {
      const av = column.sortValue ? column.sortValue(a) : column.value?.(a) ?? "";
      const bv = column.sortValue ? column.sortValue(b) : column.value?.(b) ?? "";
      const result = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true, sensitivity: "base" });
      return sortDirection === "asc" ? result : -result;
    });
  }, [rows, columns, sortKey, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / perPage));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = sortedRows.slice(currentPage * perPage, (currentPage + 1) * perPage);
  useEffect(() => { if (page !== currentPage) setPage(currentPage); }, [page, currentPage]);
  useEffect(() => { setPage(0); }, [pageResetKey]);

  function sortBy(key) {
    if (sortKey === key) setSortDirection(value => value === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDirection("asc"); }
    setPage(0);
  }

  return <>
    <Box overflowX="auto" borderWidth="1px" borderColor="rgba(148, 163, 184, 0.2)" rounded="xl">
      <Box as="table" w="full" minW="700px" borderCollapse="collapse" fontSize="sm">
        <Box as="thead" bg="rgba(2, 6, 23, 0.62)"><Box as="tr">
          {columns.map(column => <Box as="th" key={column.key} px="3" py="3" textAlign="left" borderBottomWidth="1px" borderColor="rgba(148, 163, 184, 0.2)" aria-sort={sortKey === column.key ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}>
            <Button variant="ghost" size="sm" px="1" color="gray.100" onClick={() => sortBy(column.key)} aria-label={`Sort by ${column.label}`} _hover={{ bg: "whiteAlpha.100", color: "cyan.100" }}>
              {column.label}{sortKey === column.key ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}
            </Button>
          </Box>)}
        </Box></Box>
        <Box as="tbody">
          {visibleRows.map(row => {
            const key = rowKey(row);
            const selected = selectedKey !== undefined && selectedKey === key;
            return <Box as="tr" key={key} tabIndex={onRowClick ? 0 : undefined} aria-selected={onRowClick ? selected : undefined} onClick={onRowClick ? () => onRowClick(row) : undefined} onKeyDown={onRowClick ? event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onRowClick(row); } } : undefined} cursor={onRowClick ? "pointer" : undefined} bg={selected ? "rgba(8, 145, 178, 0.2)" : "transparent"} _hover={{ bg: selected ? "rgba(8, 145, 178, 0.2)" : "rgba(148, 163, 184, 0.1)" }}>
              {columns.map(column => <Box as="td" key={column.key} px="4" py="3" borderBottomWidth="1px" borderColor="rgba(148, 163, 184, 0.14)" color="gray.200" overflowWrap="anywhere">{column.render ? column.render(row) : column.value?.(row)}</Box>)}
            </Box>;
          })}
          {visibleRows.length === 0 && <Box as="tr"><Box as="td" colSpan={columns.length} px="4" py="8" textAlign="center" color="gray.300">{emptyMessage}</Box></Box>}
        </Box>
      </Box>
    </Box>
    <HStack justify="space-between" mt="4" flexWrap="wrap" gap="3">
      <HStack gap="3">
        <Text color="gray.300" fontSize="sm">{sortedRows.length ? `${currentPage * perPage + 1}–${Math.min((currentPage + 1) * perPage, sortedRows.length)} of ${sortedRows.length}` : "0 records"}</Text>
        <Box as="select" aria-label="Rows per page" value={perPage} onChange={event => { setPerPage(Number(event.target.value)); setPage(0); }} h="8" px="2" rounded="md" bg="#0b1424" color="gray.100" borderWidth="1px" borderColor="whiteAlpha.300" fontSize="xs">
          {pageSizeOptions.map(option => <option key={option} value={option}>{option} per page</option>)}
        </Box>
      </HStack>
      <HStack>
        <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} borderColor="whiteAlpha.300" color="gray.100" bg="rgba(15,23,42,.45)" _hover={{ bg: "whiteAlpha.100" }}>Previous</Button>
        <Text color="gray.200" fontSize="sm" px="2">Page {currentPage + 1} of {pageCount}</Text>
        <Button variant="outline" size="sm" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)} borderColor="whiteAlpha.300" color="gray.100" bg="rgba(15,23,42,.45)" _hover={{ bg: "whiteAlpha.100" }}>Next</Button>
      </HStack>
    </HStack>
  </>;
}
