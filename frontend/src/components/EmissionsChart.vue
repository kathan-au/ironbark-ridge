<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
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

const loading = ref(true)
const error = ref(null)
const chartData = ref({ labels: [], datasets: [] })

const chartOptions = {
  responsive: true,
  plugins: {
    legend: { position: 'top' },
    title: { display: true, text: 'Monthly emissions by scope (kg CO2e)' },
  },
  scales: {
    x: { stacked: true },
    y: { stacked: true },
  },
}

async function fetchEmissions() {
  try {
    const response = await axios.get('http://localhost:3000/emissions/monthly')
    const data = response.data.data

    chartData.value = {
      labels: data.map(row => row.month),
      datasets: [
        {
          label: 'Scope 1 (fuel)',
          backgroundColor: '#c2410c',
          data: data.map(row => row.scope1_kg_co2e),
        },
        {
          label: 'Scope 2 (electricity)',
          backgroundColor: '#1d4ed8',
          data: data.map(row => row.scope2_kg_co2e),
        },
      ],
    }
  } catch (err) {
    error.value = 'Failed to load emissions data. Is the backend running?'
    console.error(err)
  } finally {
    loading.value = false
  }
}

onMounted(fetchEmissions)
</script>

<template>
  <div class="emissions-chart">
    <div v-if="loading">Loading emissions data...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <Bar v-else :data="chartData" :options="chartOptions" />
  </div>
</template>

<style scoped>
.emissions-chart {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
.error {
  color: #b91c1c;
}
</style>