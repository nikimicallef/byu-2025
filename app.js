// Global variables
let resultsData = [];
let lapsData = [];
let selectedRunners = new Set();
let chart = null;
let sortColumn = null;
let sortDirection = 'asc';
let currentEdition = '2025'; // Default edition

// Color palette for multiple runners
const colorPalette = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
    '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF6384'
];

// Load data on page load
document.addEventListener('DOMContentLoaded', async () => {
    checkScreenSize();
    await loadData();
    renderTable();
    setupEventListeners();
    setupEditionTabs();
    setupAnalysisTab(); // <-- add this line
    initChart();
    setupResizer();
});

// Helper function to get data URLs based on environment and edition
function getDataUrl(filename) {
    const dataFolder = `data_${currentEdition}`;
    if (window.location.hostname.includes('github.io')) {
        // GitHub Pages - use raw.githubusercontent.com URLs
        return `https://raw.githubusercontent.com/milosha/byu-2025/main/${dataFolder}/${filename}`;
    } else {
        // Local or other hosting - use relative paths
        return `./${dataFolder}/${filename}`;
    }
}

// Load data from JSON files
async function loadData() {
    try {
        const [resultsResponse, lapsResponse] = await Promise.all([
            fetch(getDataUrl('results.json')),
            fetch(getDataUrl('laps.json'))
        ]);

        resultsData = await resultsResponse.json();
        lapsData = await lapsResponse.json();

        console.log(`${currentEdition} Results loaded:`, resultsData.length);
        console.log(`${currentEdition} Laps loaded:`, lapsData.length);

        analyzeLastLapIn24HourDay();
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Setup edition tab switching
function setupEditionTabs() {
    const tabButtons = document.querySelectorAll('#editionTabs button[data-edition]');

    tabButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const edition = button.getAttribute('data-edition');
            if (edition !== currentEdition) {
                currentEdition = edition;

                // Clear selections
                selectedRunners.clear();
                sortColumn = null;
                sortDirection = 'asc';

                // Reload data
                await loadData();
                renderTable();
                updateChart();
                updateSelectedRunnersBadges();

                console.log(`Switched to ${edition} edition`);
            }
        });
    });
}

// Render table
function renderTable() {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    // Sort data only if a sort column is selected
    const sortedData = sortColumn ? [...resultsData].sort((a, b) => {
        let aVal = a[sortColumn];
        let bVal = b[sortColumn];

        // Handle numeric vs string sorting
        if (typeof aVal === 'number' || !isNaN(aVal)) {
            aVal = Number(aVal) || 0;
            bVal = Number(bVal) || 0;
        }

        if (sortDirection === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    }) : resultsData;

    // Render rows
    sortedData.forEach(runner => {
        const row = document.createElement('tr');
        row.dataset.bib = runner.Bib;
        row.classList.add('runner-row');

        if (selectedRunners.has(runner.Bib)) {
            row.classList.add('table-active');
        }

        row.innerHTML = `
            <td>${runner.Place}</td>
            <td>${runner.Bib}</td>
            <td>${runner.Name}</td>
            <td>${runner.Age}</td>
            <td>${runner.State}</td>
            <td>${runner.Laps}</td>
            <td>${runner.Miles}</td>
            <td>${runner.KM}</td>
            <td>${runner.RaceTime}</td>
        `;

        tbody.appendChild(row);
    });
}

// Setup event listeners
function setupEventListeners() {
    // Table sorting
    document.querySelectorAll('.sortable').forEach(header => {
        header.addEventListener('click', () => {
            const column = header.dataset.column;
            if (sortColumn === column) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = column;
                sortDirection = 'asc';
            }
            renderTable();
        });
    });

    // Row selection
    document.getElementById('tableBody').addEventListener('click', (e) => {
        const row = e.target.closest('tr');
        if (row) {
            const bib = parseInt(row.dataset.bib);
            if (selectedRunners.has(bib)) {
                selectedRunners.delete(bib);
                row.classList.remove('table-active');
            } else {
                selectedRunners.add(bib);
                row.classList.add('table-active');
            }
            updateChart();
            updateSelectedRunnersBadges();
        }
    });
}

// Helper function to determine if a section is trail or road
function isTrailSection(sectionNumber) {
    // Section 3 was road due to rain (exception)
    if (sectionNumber === 3 && currentEdition === '2025') return false;

    // Odd sections are normally trail, even are road
    return sectionNumber % 2 === 1;
}

// Initialize Chart
function initChart() {
    const ctx = document.getElementById('lapChart').getContext('2d');

    // Custom plugin to draw day/night background
    const dayNightPlugin = {
        id: 'dayNightBackground',
        beforeDraw: (chart) => {
            const ctx = chart.ctx;
            const chartArea = chart.chartArea;
            const xScale = chart.scales.x;

            if (!xScale || !chartArea) return;

            ctx.save();

            // Get the number of laps
            const maxLap = xScale.max || 0;

            // Draw sections with trail/road logic
            let currentLap = 1;
            let sectionNumber = 1;

            while (currentLap <= maxLap) {
                // Duration is based on original schedule (odd = 11, even = 13)
                const sectionLaps = sectionNumber === 1 ? 10 : (sectionNumber % 2 === 1 ? 11 : 13);
                const sectionEnd = Math.min(currentLap + sectionLaps - 1, maxLap);

                // Appearance is based on isTrailSection (handles rain exception)
                const isTrail = isTrailSection(sectionNumber);

                // Draw background
                const sectionStart = xScale.getPixelForValue(currentLap - 1);
                const sectionEndPixel = xScale.getPixelForValue(sectionEnd);

                ctx.fillStyle = isTrail ? 'rgba(255, 223, 0, 0.1)' : 'rgba(0, 0, 139, 0.08)';
                ctx.fillRect(
                    sectionStart,
                    chartArea.top,
                    sectionEndPixel - sectionStart,
                    chartArea.bottom - chartArea.top
                );

                currentLap += sectionLaps;
                sectionNumber++;
            }

            // Add labels for sections
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';

            currentLap = 1;
            sectionNumber = 1;

            while (currentLap <= maxLap) {
                // Duration is based on original schedule (odd = 11, even = 13)
                const sectionLaps = sectionNumber === 1 ? 10 : (sectionNumber % 2 === 1 ? 11 : 13);
                const centerLap = currentLap + (sectionLaps - 1) / 2;

                // Appearance is based on isTrailSection (handles rain exception)
                const isTrail = isTrailSection(sectionNumber);

                if (centerLap <= maxLap) {
                    const centerPixel = xScale.getPixelForValue(centerLap - 0.5);
                    let label = isTrail ? 'Trail' : 'Road';

                    // Special label for section 3 (rain exception)
                    if (sectionNumber === 3 && currentEdition === '2025') {
                        label = 'Road (rain)';
                    }

                    ctx.fillText(label, centerPixel, chartArea.top + 15);
                }

                currentLap += sectionLaps;
                sectionNumber++;
            }

            ctx.restore();
        }
    };

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: []
        },
        plugins: [dayNightPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: false,
                    font: {size: 24} // Larger title font
                },
                subtitle: {
                    display: true,
                    text: 'Click legend to (de)select data:',
                    position: 'top',
                    align: 'start',
                    padding: {
                        bottom: 10
                    },
                    font: {size: 18} // Larger subtitle font
                },
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        font: {size: 16}, // Larger legend font
                        filter: function(legendItem, chartData) {
                            // Hide "Upper Std Dev" from legend
                            return !legendItem.text.includes('Upper Std Dev');
                        }
                    },
                    onClick: function(e, legendItem, legend) {
                        const chart = legend.chart;
                        const clickedLabel = legendItem.text;

                        // If clicking on Standard Deviation, toggle both upper and lower bands
                        if (clickedLabel.includes('Standard Deviation')) {
                            const runnerName = clickedLabel.replace(' Standard Deviation', '');

                            // Find both std dev datasets for this runner
                            chart.data.datasets.forEach((dataset, i) => {
                                if (dataset.label === `${runnerName} Upper Std Dev` ||
                                    dataset.label === `${runnerName} Standard Deviation`) {
                                    const meta = chart.getDatasetMeta(i);
                                    meta.hidden = !meta.hidden;
                                }
                            });
                        } else {
                            // Default behavior for other legend items
                            const index = legendItem.datasetIndex;
                            const meta = chart.getDatasetMeta(index);
                            meta.hidden = !meta.hidden;
                        }

                        chart.update();
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    titleFont: {size: 18},
                    bodyFont: {size: 16}
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Lap Split Times (Trail: 11 hours, Road: 13 hours)',
                        font: {size: 18} // Larger axis label font
                    },
                    ticks: {
                        font: {size: 14} // Larger tick font
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Time (minutes)',
                        font: {size: 18} // Larger axis label font
                    },
                    min: 30,
                    max: 60,
                    ticks: {
                        font: {size: 14}, // Larger tick font
                        callback: function(value) {
                            const mins = Math.floor(value);
                            const secs = Math.round((value - mins) * 60);
                            return `${mins}:${secs.toString().padStart(2, '0')}`;
                        }
                    }
                }
            }
        }
    });
}

// Utility: Parse MM:SS or HH:MM:SS to minutes
function parseTimeToMinutes(timeStr) {
    if (!timeStr) return null;
    const parts = timeStr.split(':');
    if (parts.length === 2) {
        return parseInt(parts[0]) + parseInt(parts[1]) / 60;
    } else if (parts.length === 3) {
        return parseInt(parts[0]) * 60 + parseInt(parts[1]) + parseInt(parts[2]) / 60;
    }
    return null;
}

// Analysis: Calculate % of laps over 55 min for each athlete
function getLapsOver55Analysis() {
    // Only use 2025 edition
    if (currentEdition !== '2025') return [];
    // Use order in results.json for placement/order
    return resultsData.map((runner, idx) => {
        const bib = runner.Bib;
        const laps = lapsData.filter(lap => lap.File === bib);
        const lapTimes = laps.map(lap => parseTimeToMinutes(lap['Lap Split']));
        const n = lapTimes.length;
        if (n === 0) return { position: idx + 1, name: runner.Name, percentOver55: 0, laps: 0 };
        // Only consider second half
        const startIdx = Math.floor(n / 2);
        const secondHalfLapTimes = lapTimes.slice(startIdx);
        const over55 = secondHalfLapTimes.filter(t => t !== null && t > 55).length;
        const percent = secondHalfLapTimes.length > 0 ? (over55 / secondHalfLapTimes.length) * 100 : 0;
        return {
            position: idx + 1,
            name: runner.Name,
            percentOver55: percent,
            laps: secondHalfLapTimes.length
        };
    });
}

function getLapsOver55Analysis2023() {
    // Only use 2023 edition
    if (currentEdition !== '2023') return [];
    return resultsData.map((runner, idx) => {
        const bib = runner.Bib;
        const laps = lapsData.filter(lap => lap.File === bib);
        const lapTimes = laps.map(lap => parseTimeToMinutes(lap['Lap Split']));
        const n = lapTimes.length;
        if (n === 0) return { position: idx + 1, name: runner.Name, percentOver55: 0, laps: 0 };
        // Only consider second half
        const startIdx = Math.floor(n / 2);
        const secondHalfLapTimes = lapTimes.slice(startIdx);
        const over55 = secondHalfLapTimes.filter(t => t !== null && t > 55).length;
        const percent = secondHalfLapTimes.length > 0 ? (over55 / secondHalfLapTimes.length) * 100 : 0;
        return {
            position: idx + 1,
            name: runner.Name,
            percentOver55: percent,
            laps: secondHalfLapTimes.length
        };
    });
}

// Analysis: Render scatter plot with line of best fit
let analysisChart = null;
let analysisChart2023 = null;
function calculateEMAArray(values, windowSize = 6) {
    if (values.length < 2) return null;
    const emaData = [];
    const alpha = 2 / (windowSize + 1);
    for (let i = 0; i < values.length; i++) {
        if (i === 0) {
            emaData.push(values[i]);
        } else {
            const previousEMA = emaData[i - 1] !== null ? emaData[i - 1] : values[i];
            const currentEMA = alpha * values[i] + (1 - alpha) * previousEMA;
            emaData.push(currentEMA);
        }
    }
    return emaData;
}

function renderAnalysisChart() {
    const data = getLapsOver55Analysis();
    if (!data.length) return;
    const ctx = document.getElementById('analysisChart').getContext('2d');
    // Reverse order so last place is left, winner is right
    const positions = data.map(d => d.position).reverse();
    const percents = data.map(d => d.percentOver55).reverse();
    const names = data.map(d => d.name).reverse();
    // const lapsCompleted = data.map(d => d.laps).reverse();
    // Calculate laps over 55 min in second half for correlation
    const lapsOver55 = getLapsOver55Analysis().map(d => d.laps * d.percentOver55 / 100).reverse();
    // Calculate correlation between lapsOver55 and position
    let r = 0;
    if (positions.length > 1) {
        const avgX = positions.reduce((a, b) => a + b, 0) / positions.length;
        const avgY = lapsOver55.reduce((a, b) => a + b, 0) / lapsOver55.length;
        let numR = 0, denX = 0, denY = 0;
        for (let i = 0; i < positions.length; i++) {
            numR += (positions[i] - avgX) * (lapsOver55[i] - avgY);
            denX += (positions[i] - avgX) ** 2;
            denY += (lapsOver55[i] - avgY) ** 2;
        }
        r = numR / Math.sqrt(denX * denY);
    }
    // Calculate EMA (window 6)
    // const emaLine = calculateEMAArray(percents, 6);
    // Calculate line of best fit (linear regression)
    const n = positions.length;
    const sumX = positions.reduce((a, b) => a + b, 0);
    const sumY = percents.reduce((a, b) => a + b, 0);
    const sumXY = positions.reduce((a, b, i) => a + b * percents[i], 0);
    const sumXX = positions.reduce((a, b) => a + b * b, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const fitLine = positions.map(x => slope * x + intercept);
    // Destroy previous chart
    analyzeContributions();
    if (analysisChart) analysisChart.destroy();
    analysisChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: names,
            datasets: [
                // {
                //     type: 'bar',
                //     label: 'Number of Laps',
                //     data: lapsCompleted,
                //     backgroundColor: 'rgba(54, 162, 235, 0.2)',
                //     yAxisID: 'y1',
                //     order: 1,
                //     barPercentage: 0.8,
                //     categoryPercentage: 0.8
                // },
                {
                    label: '% Laps > 55min',
                    type: 'scatter',
                    data: positions.map((x, i) => ({x: names[i], y: percents[i]})),
                    backgroundColor: '#36A2EB',
                    pointRadius: 4,
                    yAxisID: 'y',
                    order: 2
                },
                // {
                //     label: 'Weighted Avg (EMA, 6)',
                //     type: 'line',
                //     data: positions.map((x, i) => ({x: names[i], y: emaLine[i]})),
                //     borderColor: '#FF6384',
                //     borderWidth: 2,
                //     fill: false,
                //     pointRadius: 0,
                //     yAxisID: 'y',
                //     order: 3
                // },
                {
                    label: 'Best Fit',
                    type: 'line',
                    data: positions.map((x, i) => ({x: names[i], y: fitLine[i]})),
                    borderColor: '#FFCE56',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0,
                    yAxisID: 'y',
                    order: 4
                }
            ]
        },
        // plugins: [{
        //     id: 'dayNightLines',
        //     beforeDraw: (chart) => {
        //         const positions = chart.options.plugins.dayNightLines.positions;
        //         const yScale = chart.scales.y1;
        //         const chartArea = chart.chartArea;
        //         if (!yScale || !chartArea) return;
        //         const ctx = chart.ctx;
        //         ctx.save();
        //         ctx.strokeStyle = '#888';
        //         ctx.setLineDash([6, 6]);
        //         positions.forEach(pos => {
        //             const y = yScale.getPixelForValue(pos);
        //             ctx.beginPath();
        //             ctx.moveTo(chartArea.left, y);
        //             ctx.lineTo(chartArea.right, y);
        //             ctx.stroke();
        //         });
        //         ctx.setLineDash([]);
        //         ctx.restore();
        //     }
        // }],
        options: {
            plugins: {
                title: {
                    display: true,
                    text: `% of Laps Over 55 Minutes in 2nd Half by Placement (2025) - r = ${r.toFixed(3)}`,
                    font: {size: 24}
                },
                legend: {
                    display: true,
                    labels: {font: {size: 16}}
                }
                // ,
                // dayNightLines: {
                //     enabled: true,
                //     positions: [11, 24, 35, 48, 59, 72, 83, 96, 107]
                // }
            },
            scales: {
                x: {
                    type: 'category',
                    labels: names,
                    title: {
                        display: true,
                        text: 'Athlete (Last Place = left, Winner = right)',
                        font: {size: 18}
                    },
                    ticks: {
                        autoSkip: false,
                        maxRotation: 45,
                        minRotation: 45,
                        font: {size: 14}
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: '% of Laps > 55min',
                        font: {size: 18}
                    },
                    min: 0,
                    max: 100,
                    position: 'left',
                    ticks: {font: {size: 14}}
                }
                // ,
                // y1: {
                //     title: {
                //         display: true,
                //         text: 'Number of Laps'
                //     },
                //     min: 0,
                //     max: Math.max(...lapsCompleted) + 2,
                //     position: 'right',
                //     grid: {
                //         drawOnChartArea: false
                //     }
                // }
            }
        }
    });
}

function renderAnalysisChart2023() {
    const data = getLapsOver55Analysis2023();
    if (!data.length) return;
    const ctx = document.getElementById('analysisChart2023').getContext('2d');
    // Reverse order so last place is left, winner is right
    const positions = data.map(d => d.position).reverse();
    const percents = data.map(d => d.percentOver55).reverse();
    const names = data.map(d => d.name).reverse();
    // const lapsCompleted = data.map(d => d.laps).reverse();
    // Calculate laps over 55 min in second half for correlation
    const lapsOver55 = getLapsOver55Analysis2023().map(d => d.laps * d.percentOver55 / 100).reverse();
    // Calculate correlation between lapsOver55 and position
    let r = 0;
    if (positions.length > 1) {
        const avgX = positions.reduce((a, b) => a + b, 0) / positions.length;
        const avgY = lapsOver55.reduce((a, b) => a + b, 0) / lapsOver55.length;
        let numR = 0, denX = 0, denY = 0;
        for (let i = 0; i < positions.length; i++) {
            numR += (positions[i] - avgX) * (lapsOver55[i] - avgY);
            denX += (positions[i] - avgX) ** 2;
            denY += (lapsOver55[i] - avgY) ** 2;
        }
        r = numR / Math.sqrt(denX * denY);
    }
    // Calculate EMA (window 6)
    // const emaLine = calculateEMAArray(percents, 6);
    // Calculate line of best fit (linear regression)
    const n = positions.length;
    const sumX = positions.reduce((a, b) => a + b, 0);
    const sumY = percents.reduce((a, b) => a + b, 0);
    const sumXY = positions.reduce((a, b, i) => a + b * percents[i], 0);
    const sumXX = positions.reduce((a, b) => a + b * b, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const fitLine = positions.map(x => slope * x + intercept);
    // Destroy previous chart
    if (analysisChart2023) analysisChart2023.destroy();
    analyzeContributions();
    analysisChart2023 = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: names,
            datasets: [
                // {
                //     type: 'bar',
                //     label: 'Number of Laps',
                //     data: lapsCompleted,
                //     backgroundColor: 'rgba(54, 162, 235, 0.2)',
                //     yAxisID: 'y1',
                //     order: 1,
                //     barPercentage: 0.8,
                //     categoryPercentage: 0.8
                // },
                {
                    label: '% Laps > 55min',
                    type: 'scatter',
                    data: positions.map((x, i) => ({x: names[i], y: percents[i]})),
                    backgroundColor: '#36A2EB',
                    pointRadius: 4,
                    yAxisID: 'y',
                    order: 2
                },
                // {
                //     label: 'Weighted Avg (EMA, 6)',
                //     type: 'line',
                //     data: positions.map((x, i) => ({x: names[i], y: emaLine[i]})),
                //     borderColor: '#FF6384',
                //     borderWidth: 2,
                //     fill: false,
                //     pointRadius: 0,
                //     yAxisID: 'y',
                //     order: 3
                // },
                {
                    label: 'Best Fit',
                    type: 'line',
                    data: positions.map((x, i) => ({x: names[i], y: fitLine[i]})),
                    borderColor: '#FFCE56',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0,
                    yAxisID: 'y',
                    order: 4
                }
            ]
        },
        // plugins: [{
        //     id: 'dayNightLines2023',
        //     beforeDraw: (chart) => {
        //         const positions = chart.options.plugins.dayNightLines.positions;
        //         const yScale = chart.scales.y1;
        //         const chartArea = chart.chartArea;
        //         if (!yScale || !chartArea) return;
        //         const ctx = chart.ctx;
        //         ctx.save();
        //         ctx.strokeStyle = '#888';
        //         ctx.setLineDash([6, 6]);
        //         positions.forEach(pos => {
        //             const y = yScale.getPixelForValue(pos);
        //             ctx.beginPath();
        //             ctx.moveTo(chartArea.left, y);
        //             ctx.lineTo(chartArea.right, y);
        //             ctx.stroke();
        //         });
        //         ctx.setLineDash([]);
        //         ctx.restore();
        //     }
        // }],
        options: {
            plugins: {
                title: {
                    display: true,
                    text: `% of Laps Over 55 Minutes in 2nd Half by Placement (2023) - r = ${r.toFixed(3)}`,
                    font: {size: 24}
                },
                legend: {
                    display: true,
                    labels: {font: {size: 16}}
                }
                // ,
                // dayNightLines: {
                //     enabled: true,
                //     positions: [11, 24, 35, 48, 59, 72, 83, 96, 107]
                // }
            },
            scales: {
                x: {
                    type: 'category',
                    labels: names,
                    title: {
                        display: true,
                        text: 'Athlete (Last Place = left, Winner = right)',
                        font: {size: 18}
                    },
                    ticks: {
                        autoSkip: false,
                        maxRotation: 45,
                        minRotation: 45,
                        font: {size: 14}
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: '% of Laps > 55min',
                        font: {size: 18}
                    },
                    min: 0,
                    max: 60,
                    position: 'left',
                    ticks: {font: {size: 14}}
                }
                // ,
                // y1: {
                //     title: {
                //         display: true,
                //         text: 'Number of Laps'
                //     },
                //     min: 0,
                //     max: Math.max(...lapsCompleted) + 2,
                //     position: 'right',
                //     grid: {
                //         drawOnChartArea: false
                //     }
                // }
            }
        }
    });
}

// Correlation: Calculate Pearson correlation coefficient
let correlationChart = null;
function calculatePearsonCorrelation(x, y) {
    const n = x.length;
    const avgX = x.reduce((a, b) => a + b, 0) / n;
    const avgY = y.reduce((a, b) => a + b, 0) / n;
    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
        num += (x[i] - avgX) * (y[i] - avgY);
        denX += (x[i] - avgX) ** 2;
        denY += (y[i] - avgY) ** 2;
    }
    return num / Math.sqrt(denX * denY);
}

function getCombinedCorrelationData() {
    // Load both results.json files for 2023 and 2025
    // This function assumes resultsData is for the current edition, but we want both
    // We'll fetch both synchronously for charting
    // Use cached data if available
    if (window.combinedCorrelationData) return window.combinedCorrelationData;
    window.combinedCorrelationData = [];
    // Synchronous fetch (since this is for charting, not UI)
    const req2023 = new XMLHttpRequest();
    req2023.open('GET', getDataUrl('results.json').replace('data_2025', 'data_2023'), false);
    req2023.send(null);
    let data2023 = [];
    if (req2023.status === 200) {
        try { data2023 = JSON.parse(req2023.responseText); } catch {}
    }
    const req2025 = new XMLHttpRequest();
    req2025.open('GET', getDataUrl('results.json').replace('data_2023', 'data_2025'), false);
    req2025.send(null);
    let data2025 = [];
    if (req2025.status === 200) {
        try { data2025 = JSON.parse(req2025.responseText); } catch {}
    }
    window.combinedCorrelationData = [...data2023, ...data2025].filter(r => r.ItraScore !== undefined && r.Laps !== undefined && Number(r.ItraScore) > 0);
    return window.combinedCorrelationData;
}

function renderCorrelationChart() {
    const data = getCombinedCorrelationData();
    const itraScores = data.map(r => Number(r.ItraScore));
    const laps = data.map(r => Number(r.Laps));
    // Calculate line of best fit
    const n = itraScores.length;
    const xMean = itraScores.reduce((a,b) => a+b,0)/n;
    const yMean = laps.reduce((a,b) => a+b,0)/n;
    const num = itraScores.map((xi,i) => (xi-xMean)*(laps[i]-yMean)).reduce((a,b) => a+b,0);
    const den = itraScores.map(xi => (xi-xMean)**2).reduce((a,b) => a+b,0);
    const slope = num/den;
    const intercept = yMean - slope*xMean;
    // Prepare line points
    const xMin = Math.min(...itraScores);
    const xMax = Math.max(...itraScores);
    const fitYMin = slope*xMin + intercept;
    const fitYMax = slope*xMax + intercept;
    // Calculate Pearson correlation coefficient
    let r = 0;
    if (itraScores.length > 1) {
        const avgX = xMean;
        const avgY = yMean;
        let numR = 0, denX = 0, denY = 0;
        for (let i = 0; i < n; i++) {
            numR += (itraScores[i] - avgX) * (laps[i] - avgY);
            denX += (itraScores[i] - avgX) ** 2;
            denY += (laps[i] - avgY) ** 2;
        }
        r = numR / Math.sqrt(denX * denY);
    }
    if (correlationChart) correlationChart.destroy();
    const ctx = document.getElementById('correlationChart').getContext('2d');
    correlationChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Athletes',
                    data: data.map(r => ({x: Number(r.ItraScore), y: Number(r.Laps), name: r.Name})),
                    backgroundColor: '#36A2EB',
                },
                {
                    label: 'Correlation Line',
                    type: 'line',
                    data: [
                        {x: xMin, y: fitYMin},
                        {x: xMax, y: fitYMax}
                    ],
                    borderColor: '#FFCE56',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0,
                    showLine: true,
                }
            ]
        },
        options: {
            plugins: {
                legend: {position: 'top', labels: {font: {size: 16}}},
                title: {display: true, text: `ITRA Score vs. Laps Completed (2023 & 2025 Combined) — r = ${r.toFixed(3)}`, font: {size: 24}},
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const d = context.raw;
                            if (d.name) {
                                return `${d.name}: ITRA ${d.x}, Laps ${d.y}`;
                            }
                            return `ITRA ${d.x}, Laps ${d.y}`;
                        }
                    },
                    titleFont: {size: 18},
                    bodyFont: {size: 16}
                }
            },
            scales: {
                x: {
                    title: {display: true, text: 'ITRA Score', font: {size: 18}},
                    min: xMin,
                    max: xMax,
                    ticks: {font: {size: 14}}
                },
                y: {
                    title: {display: true, text: 'Laps Completed', font: {size: 18}},
                    ticks: {font: {size: 14}}
                }
            }
        }});
}

// Correlation: UTMB finishing time vs ITRA score
let correlationChartUTMB = null;

function parseTimeToMinutesUTMB(timeStr) {
    // Format: HH:MM:SS
    const [h, m, s] = timeStr.split(':').map(Number);
    return h * 60 + m + s / 60;
}

function getUTMBCorrelationData() {
    // Synchronous fetch of CSV
    const req = new XMLHttpRequest();
    req.open('GET', './data_utmb/results.csv', false);
    req.send(null);
    let rows = [];
    if (req.status === 200) {
        rows = req.responseText.trim().split('\n').slice(1); // skip header
    }
    const data = rows.map(row => {
        const [time, itra] = row.split(',');
        return {
            time: parseTimeToMinutesUTMB(time),
            itra: Number(itra),
            label: time + ' / ' + itra
        };
    });
    return data;
}

function renderCorrelationChartUTMB() {
    let data = getUTMBCorrelationData();
    // Sort by ITRA score ascending (lowest to highest)
    data = data.sort((a, b) => a.itra - b.itra);
    const itras = data.map(d => d.itra);
    const times = data.map(d => d.time);
    // Linear regression: y = finishing time, x = ITRA score
    const n = itras.length;
    const xMean = itras.reduce((a,b) => a+b,0)/n;
    const yMean = times.reduce((a,b) => a+b,0)/n;
    const num = itras.map((xi,i) => (xi-xMean)*(times[i]-yMean)).reduce((a,b) => a+b,0);
    const den = itras.map(xi => (xi-xMean)**2).reduce((a,b) => a+b,0);
    const slope = num/den;
    const intercept = yMean - slope*xMean;
    // Prepare line points
    const xMin = Math.min(...itras);
    const xMax = Math.max(...itras);
    const fitYMin = slope*xMin + intercept;
    const fitYMax = slope*xMax + intercept;
    // Pearson correlation
    let r = 0;
    if (itras.length > 1) {
        let numR = 0, denX = 0, denY = 0;
        for (let i = 0; i < n; i++) {
            numR += (itras[i] - xMean) * (times[i] - yMean);
            denX += (itras[i] - xMean) ** 2;
            denY += (times[i] - yMean) ** 2;
        }
        r = numR / Math.sqrt(denX * denY);
    }
    if (correlationChartUTMB) correlationChartUTMB.destroy();
    const ctx = document.getElementById('correlationChartUTMB').getContext('2d');
    correlationChartUTMB = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Athletes',
                    data: data.map(d => ({x: d.itra, y: d.time, label: d.label})),
                    backgroundColor: '#36A2EB',
                },
                {
                    label: 'Correlation Line',
                    type: 'line',
                    data: [
                        {x: xMin, y: fitYMin},
                        {x: xMax, y: fitYMax}
                    ],
                    borderColor: '#FFCE56',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0,
                    showLine: true,
                }
            ]
        },
        options: {
            plugins: {
                legend: {position: 'top', labels: {font: {size: 16}}},
                title: {display: true, text: `ITRA Score vs. Finishing Time - r = ${r.toFixed(3)}`, font: {size: 24}},
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const d = context.raw;
                            if (d.label) {
                                return d.label;
                            }
                            return `ITRA ${d.x}, Time ${d.y}`;
                        }
                    },
                    titleFont: {size: 18},
                    bodyFont: {size: 16}
                }
            },
            scales: {
                x: {
                    title: {display: true, text: 'ITRA Score', font: {size: 18}},
                    min: xMin,
                    max: xMax,
                    ticks: {font: {size: 14}}
                },
                y: {
                    title: {display: true, text: 'Finishing Time (minutes)', font: {size: 18}},
                    min: Math.min(...times),
                    max: Math.max(...times),
                    ticks: {font: {size: 14}}
                }
            }
        }});
}

// Setup analysis tab event
function setupAnalysisTab() {
    const analysisTab = document.getElementById('tab-analysis');
    const analysisTab2023 = document.getElementById('tab-analysis-2023');
    const correlationTab = document.getElementById('tab-correlation');
    const utmbCorrelationTab = document.getElementById('tab-correlation-utmb');
    const analysisChartContainer = document.getElementById('analysisChartContainer');
    const analysisChartContainer2023 = document.getElementById('analysisChartContainer2023');
    const correlationChartContainer = document.getElementById('correlationChartContainer');
    const correlationChartContainerUTMB = document.getElementById('correlationChartContainerUTMB');
    const lapChartContainer = document.querySelector('.chart-container');
    analysisTab.addEventListener('click', () => {
        analysisChartContainer.style.display = '';
        analysisChartContainer2023.style.display = 'none';
        correlationChartContainer.style.display = 'none';
        correlationChartContainerUTMB.style.display = 'none';
        lapChartContainer.style.display = 'none';
        document.getElementById('selectedRunners').style.display = 'none';
        renderAnalysisChart();
    });
    analysisTab2023.addEventListener('click', () => {
        analysisChartContainer.style.display = 'none';
        analysisChartContainer2023.style.display = '';
        correlationChartContainer.style.display = 'none';
        correlationChartContainerUTMB.style.display = 'none';
        lapChartContainer.style.display = 'none';
        document.getElementById('selectedRunners').style.display = 'none';
        renderAnalysisChart2023();
    });
    correlationTab.addEventListener('click', () => {
        analysisChartContainer.style.display = 'none';
        analysisChartContainer2023.style.display = 'none';
        correlationChartContainer.style.display = '';
        correlationChartContainerUTMB.style.display = 'none';
        lapChartContainer.style.display = 'none';
        document.getElementById('selectedRunners').style.display = 'none';
        renderCorrelationChart();
    });
    utmbCorrelationTab.addEventListener('click', () => {
        analysisChartContainer.style.display = 'none';
        analysisChartContainer2023.style.display = 'none';
        correlationChartContainer.style.display = 'none';
        correlationChartContainerUTMB.style.display = '';
        lapChartContainer.style.display = 'none';
        document.getElementById('selectedRunners').style.display = 'none';
        renderCorrelationChartUTMB();
    });
    // Restore main chart when switching tabs
    document.getElementById('tab-2025').addEventListener('click', () => {
        analysisChartContainer.style.display = 'none';
        analysisChartContainer2023.style.display = 'none';
        correlationChartContainer.style.display = 'none';
        correlationChartContainerUTMB.style.display = 'none';
        lapChartContainer.style.display = '';
        document.getElementById('selectedRunners').style.display = '';
    });
    document.getElementById('tab-2023').addEventListener('click', () => {
        analysisChartContainer.style.display = 'none';
        analysisChartContainer2023.style.display = 'none';
        correlationChartContainer.style.display = 'none';
        correlationChartContainerUTMB.style.display = 'none';
        lapChartContainer.style.display = '';
        document.getElementById('selectedRunners').style.display = '';
    });
}


// Calculate statistics for a runner's laps
function calculateStats(lapTimes) {
    const validTimes = lapTimes.filter(t => t !== null);
    if (validTimes.length === 0) return { mean: 0, stdDev: 0 };

    const mean = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
    const variance = validTimes.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / validTimes.length;
    const stdDev = Math.sqrt(variance);

    return { mean, stdDev };
}

// Calculate linear regression for trendline
function calculateTrendline(lapTimes) {
    const validPoints = [];
    lapTimes.forEach((time, index) => {
        if (time !== null) {
            validPoints.push({ x: index + 1, y: time });
        }
    });

    if (validPoints.length < 2) return null;

    const n = validPoints.length;
    const sumX = validPoints.reduce((sum, point) => sum + point.x, 0);
    const sumY = validPoints.reduce((sum, point) => sum + point.y, 0);
    const sumXY = validPoints.reduce((sum, point) => sum + point.x * point.y, 0);
    const sumXX = validPoints.reduce((sum, point) => sum + point.x * point.x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
}

// Calculate Exponential Moving Average (EMA) with 6-lap window
function calculateEMA(lapTimes, windowSize = 6) {
    if (lapTimes.length < 2) return null;

    const emaData = [];
    const alpha = 2 / (windowSize + 1); // Smoothing factor

    for (let i = 0; i < lapTimes.length; i++) {
        if (lapTimes[i] === null) {
            emaData.push(null);
            continue;
        }

        if (i === 0) {
            // First value uses the actual lap time
            emaData.push(lapTimes[i]);
        } else {
            // Collect valid previous laps within the window
            const validPreviousLaps = [];
            for (let j = Math.max(0, i - windowSize); j < i; j++) {
                if (lapTimes[j] !== null) {
                    validPreviousLaps.push(lapTimes[j]);
                }
            }

            if (validPreviousLaps.length === 0) {
                emaData.push(lapTimes[i]);
            } else {
                // Calculate EMA: EMA = α × Current + (1 - α) × Previous EMA
                const previousEMA = emaData[i - 1] !== null ? emaData[i - 1] : lapTimes[i];
                const currentEMA = alpha * lapTimes[i] + (1 - alpha) * previousEMA;
                emaData.push(currentEMA);
            }
        }
    }

    return emaData;
}

// Update chart with selected runners
function updateChart() {
    if (!chart) return;

    const datasets = [];
    let maxLaps = 0;

    Array.from(selectedRunners).forEach((bib, index) => {
        const runner = resultsData.find(r => r.Bib === bib);
        if (!runner) return;

        // Get lap data for this runner (File number corresponds to Bib)
        const runnerLaps = lapsData.filter(lap => lap.File === bib);
        const lapTimes = runnerLaps.map(lap => parseTimeToMinutes(lap['Lap Split']));

        maxLaps = Math.max(maxLaps, lapTimes.length);

        const color = colorPalette[index % colorPalette.length];

        // Find min and max points
        const validTimes = lapTimes.filter(t => t !== null);
        const minTime = Math.min(...validTimes);
        const maxTime = Math.max(...validTimes);

        // Main line dataset
        const dataset = {
            label: runner.Name,
            data: lapTimes,
            borderColor: color,
            backgroundColor: color + '33',
            tension: 0.1,
            pointRadius: lapTimes.map(t => {
                if (t === minTime || t === maxTime) return 6;
                return 3;
            }),
            pointBackgroundColor: lapTimes.map(t => {
                if (t === minTime) return '#00FF00';
                if (t === maxTime) return '#FF0000';
                return color;
            }),
            pointBorderColor: lapTimes.map(t => {
                if (t === minTime || t === maxTime) return '#000000';
                return color;
            }),
            pointBorderWidth: lapTimes.map(t => {
                if (t === minTime || t === maxTime) return 2;
                return 1;
            })
        };

        datasets.push(dataset);

        // Add trendline for up to 3 runners
        if (selectedRunners.size <= 3) {
            const trendline = calculateTrendline(lapTimes);
            if (trendline) {
                const trendData = lapTimes.map((_, index) => {
                    const lapNumber = index + 1;
                    const trendValue = trendline.slope * lapNumber + trendline.intercept;
                    return Math.max(30, Math.min(60, trendValue)); // Clamp to chart bounds
                });

                datasets.push({
                    label: `${runner.Name} Trend`,
                    data: trendData,
                    borderColor: color + 'CC',
                    backgroundColor: 'transparent',
                    borderDash: [15, 5],
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false
                });
            }

            // Add EMA trend line (6-lap rolling weighted average)
            const emaData = calculateEMA(lapTimes, 6);
            if (emaData) {
                datasets.push({
                    label: `${runner.Name} EMA (6-lap)`,
                    data: emaData.map(val => val !== null ? Math.max(30, Math.min(60, val)) : null),
                    borderColor: color + 'AA',
                    backgroundColor: 'transparent',
                    borderDash: [5, 5],
                    borderWidth: 3,
                    pointRadius: 0,
                    fill: false,
                    hidden: true
                });
            }
        }

        // Add standard deviation bands for up to two runners
        if (selectedRunners.size <= 2) {
            const stats = calculateStats(validTimes);

            // Upper band (mean + std dev)
            datasets.push({
                label: `${runner.Name} Upper Std Dev`,
                data: lapTimes.map(t => t !== null ? Math.min(stats.mean + stats.stdDev, 60) : null),
                borderColor: color + '40',
                backgroundColor: 'transparent',
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false,
                hidden: true
            });

            // Lower band (mean - std dev)
            datasets.push({
                label: `${runner.Name} Standard Deviation`,
                data: lapTimes.map(t => t !== null ? Math.max(stats.mean - stats.stdDev, 30) : null),
                borderColor: color + '40',
                backgroundColor: color + '20',
                borderDash: [5, 5],
                pointRadius: 0,
                fill: '-1',
                hidden: true
            });

        }
    });

    // Update chart
    chart.data.labels = Array.from({length: maxLaps}, (_, i) => i + 1);
    chart.data.datasets = datasets;
    chart.update();
}

// Update selected runners badges
function updateSelectedRunnersBadges() {
    const container = document.getElementById('selectedRunners');
    container.innerHTML = '';

    Array.from(selectedRunners).forEach((bib, index) => {
        const runner = resultsData.find(r => r.Bib === bib);
        if (!runner) return;

        const color = colorPalette[index % colorPalette.length];
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.style.backgroundColor = color;
        badge.style.color = 'white';
        badge.style.padding = '5px 10px';
        badge.innerHTML = `
            ${runner.Name} (#${runner.Bib})
            <span style="cursor: pointer; margin-left: 5px;" onclick="removeRunner(${bib})">×</span>
        `;
        container.appendChild(badge);
    });
}

// Remove runner from selection
function removeRunner(bib) {
    selectedRunners.delete(bib);
    document.querySelector(`tr[data-bib="${bib}"]`)?.classList.remove('table-active');
    updateChart();
    updateSelectedRunnersBadges();
}

// Setup resizable divider
function setupResizer() {
    const divider = document.getElementById('divider');
    const leftPanel = document.getElementById('leftPanel');
    const container = document.querySelector('.split-container');
    let isResizing = false;

    divider.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const containerRect = container.getBoundingClientRect();
        const newWidth = e.clientX - containerRect.left;
        const percentWidth = (newWidth / containerRect.width) * 100;

        // Limit the width between 10% and 50%
        if (percentWidth >= 10 && percentWidth <= 50) {
            leftPanel.style.width = percentWidth + '%';

            // Trigger chart resize
            if (chart) {
                setTimeout(() => chart.resize(), 0);
            }
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

// Check screen size and show overlay for small screens
function checkScreenSize() {
    const overlay = document.getElementById('smallScreenOverlay');
    const dismissButton = document.getElementById('dismissOverlay');

    // Check if screen width is less than 700px
    if (window.innerWidth < 700) {
        overlay.style.display = 'flex';
    }

    // Dismiss overlay when OK button is clicked
    dismissButton.addEventListener('click', () => {
        overlay.style.display = 'none';
    });

    // Optional: Re-check on window resize
    window.addEventListener('resize', () => {
        if (window.innerWidth < 700) {
            overlay.style.display = 'flex';
        } else {
            overlay.style.display = 'none';
        }
    });
}

// Calculate standardized beta coefficients for multiple regression
function analyzeContributions() {
    // Prepare data
    const data = resultsData.map((runner, idx) => {
        const bib = runner.Bib;
        const laps = lapsData.filter(lap => lap.File === bib);
        const lapTimes = laps.map(lap => parseTimeToMinutes(lap['Lap Split']));
        const n = lapTimes.length;
        const startIdx = Math.floor(n / 2);
        const secondHalfLapTimes = lapTimes.slice(startIdx);
        const lapsOver55 = secondHalfLapTimes.filter(t => t !== null && t > 55).length;
        return {
            position: idx + 1,
            itra: Number(runner.ItraScore),
            lapsOver55: lapsOver55
        };
    }).filter(d => !isNaN(d.itra));

    // Extract arrays
    const positions = data.map(d => d.position);
    const itras = data.map(d => d.itra);
    const lapsOver55Arr = data.map(d => d.lapsOver55);

    // Standardize variables
    function standardize(arr) {
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        const std = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
        return arr.map(x => (x - mean) / std);
    }
    const posZ = standardize(positions);
    const itraZ = standardize(itras);
    const lapsZ = standardize(lapsOver55Arr);

    // Multiple regression: posZ = b1 * itraZ + b2 * lapsZ + error
    // Use least squares
    const n = posZ.length;
    let sumItra2 = 0, sumLaps2 = 0, sumItraLaps = 0, sumItraPos = 0, sumLapsPos = 0;
    for (let i = 0; i < n; i++) {
        sumItra2 += itraZ[i] * itraZ[i];
        sumLaps2 += lapsZ[i] * lapsZ[i];
        sumItraLaps += itraZ[i] * lapsZ[i];
        sumItraPos += itraZ[i] * posZ[i];
        sumLapsPos += lapsZ[i] * posZ[i];
    }
    // Solve for b1 and b2
    const denom = sumItra2 * sumLaps2 - sumItraLaps * sumItraLaps;
    const b1 = (sumLaps2 * sumItraPos - sumItraLaps * sumLapsPos) / denom;
    const b2 = (sumItra2 * sumLapsPos - sumItraLaps * sumItraPos) / denom;

    // Output results
    console.log(`Standardized beta coefficients (share of each factor in final position):`);
    console.log(`ITRA Score: ${b1.toFixed(3)}`);
    console.log(`Laps over 55 min (2nd half): ${b2.toFixed(3)}`);
    console.log(`Higher absolute value means greater influence on final position.`);
}

// Find which lap in a 24-hour day athletes quit on most
function analyzeLastLapIn24HourDay() {
    // Exclude runners with 24 or fewer laps
    const filtered = resultsData.filter(runner => Number(runner.Laps) > 24);

    // Get last lap within 24-hour cycle for each runner
    const lastLaps = filtered.map(runner => Number(runner.Laps) % 24 || 24);

    // Count occurrences of each last lap
    const lapCounts = {};
    lastLaps.forEach(lap => {
        lapCounts[lap] = (lapCounts[lap] || 0) + 1;
    });

    // Output per person and summary
    console.log('Last lap within 24-hour day per runner:', lastLaps);
    console.log('Number of runners quitting on each lap (1-24):', lapCounts);
}

