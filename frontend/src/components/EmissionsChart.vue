<script setup>
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
} from 'chart.js'

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale)

const props = defineProps({ data: { type: Array, default: () => [] }, loading: Boolean })
const chartData = computed(() => ({
  labels: props.data.map(row => row.month),
  datasets: [
    { label: 'Scope 1 / fuel', backgroundColor: '#e76f51', borderRadius: 3, data: props.data.map(row => row.scope1_kg_co2e) },
    { label: 'Scope 2 / electricity', backgroundColor: '#2a9d8f', borderRadius: 3, data: props.data.map(row => row.scope2_kg_co2e) },
  ],
}))

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8, color: '#52605c', font: { family: 'DM Sans' } } },
    tooltip: { callbacks: { label: context => ` ${new Intl.NumberFormat('en-AU').format(context.raw)} kg CO2e` } },
  },
  scales: {
    x: { stacked: true, grid: { display: false }, ticks: { color: '#7a8580', font: { family: 'DM Sans' } } },
    y: { stacked: true, grid: { color: '#e7ebe6' }, ticks: { color: '#7a8580', font: { family: 'DM Sans' }, callback: value => new Intl.NumberFormat('en-AU', { notation: 'compact' }).format(value) } },
  },
}

</script>

<template>
  <div class="emissions-chart">
    <div v-if="loading" class="chart-placeholder">Loading emissions data...</div>
    <div v-else-if="!data.length" class="chart-placeholder">No emissions data available.</div>
    <Bar v-else :data="chartData" :options="chartOptions" />
  </div>
</template>

<style scoped>
.emissions-chart {
  height: 330px;
  min-width: 0;
  position: relative;
  width: 100%;
}
.chart-placeholder {
  align-items: center;
  color: var(--ink-muted);
  display: flex;
  height: 100%;
  justify-content: center;
}
</style>