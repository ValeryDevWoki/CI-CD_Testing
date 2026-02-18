// src/utils/csvUtils.js
export function convertToCSV(data) {
    if (!data || !data.length) {
        return '';
    }
    const headers = Object.keys(data[0]);
    const csvRows = [
        headers.join(','), // header row
        ...data.map(row =>
            headers
                .map(fieldName => {
                    let cell = row[fieldName] ?? '';
                    // Escape quotes
                    cell = String(cell).replace(/"/g, '""');
                    return `"${cell}"`;
                })
                .join(',')
        ),
    ];
    return csvRows.join('\n');
}
