<script setup>
import EmissionsChart from './components/EmissionsChart.vue'
</script>

<template>
  <div class="app">
    <header>
      <h1>Ironbark Ridge — Sustainability Dashboard</h1>
    </header>
    <main>
      <EmissionsChart />
    </main>
  </div>
</template>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #f5f5f4;
  color: #1c1917;
}

.app {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px;
}

header h1 {
  font-size: 22px;
  font-weight: 600;
  margin-bottom: 24px;
}
</style>