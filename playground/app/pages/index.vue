<template>
  <div class="flex flex-col items-center justify-center gap-4 min-h-screen">
    <h1>Public Access Key: {{ config.nuxfly?.publicBucket?.s3AccessKeyId }}</h1>
    <h1>Private Access Key: {{ config.nuxfly?.privateBucket?.s3AccessKeyId }}</h1>
    <UCard class="w-full max-w-md">
      <template #header>
        <h1 class="font-bold text-xl text-center">Todo List</h1>
      </template>

      <div class="flex items-center gap-2 mb-4">
        <UInput v-model="newTodo" class="flex-grow" placeholder="Add a new todo" @keyup.enter="addTodo" />
        <UButton label="Add" @click="addTodo" />
      </div>

      <div v-for="todo in todos" :key="todo.id" class="flex items-center gap-2 py-2 border-b">
        <UCheckbox :model-value="todo.completed" @update:model-value="updateTodo(todo)" />
        <span :class="{ 'line-through': todo.completed }">{{ todo.title }}</span>
      </div>
    </UCard>

    <UCard class="w-full max-w-md">
      <template #header>
        <h1 class="font-bold text-xl text-center">Image Gallery</h1>
      </template>

      <div class="flex items-center gap-2 mb-4">
        <UInput type="file" @change="handleFileChange" :key="fileInputKey" />
        <UButton label="Upload" @click="uploadImage" :disabled="!fileToUpload" />
      </div>

      <div class="grid grid-cols-3 gap-2">
        <div v-for="image in images" :key="image">
          <img :src="imageUrl(image)" class="w-full h-auto" />
        </div>
      </div>
    </UCard>
  </div>
</template>


<script setup lang="ts">
const { data: todos, refresh } = useAsyncData("todos", () =>
  $fetch("/api/todos")
);

const newTodo = ref("");

async function addTodo() {
  if (!newTodo.value.trim()) return;
  await $fetch("/api/todos", {
    method: "POST",
    body: { title: newTodo.value },
  });
  newTodo.value = "";
  await refresh();
}

async function updateTodo(todo: any) {
  await $fetch(`/api/todos`, {
    method: "PUT",
    body: { id: todo.id, completed: !todo.completed },
  });
  await refresh();
}

const { data: images, refresh: refreshImages } = useAsyncData("images", () =>
  $fetch("/api/images")
);

const fileToUpload = ref<File | null>(null);
const fileInputKey = ref(0);

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    fileToUpload.value = target.files[0];
  }
}

async function uploadImage() {
  if (!fileToUpload.value) {
    return;
  }
  const formData = new FormData();
  formData.append('file', fileToUpload.value);

  await $fetch('/api/images', {
    method: 'POST',
    body: formData,
  });

  fileToUpload.value = null;
  fileInputKey.value++;
  await refreshImages();
}
const config = useRuntimeConfig();
const imageUrl = (key: string) => `${config.public.s3PublicUrl}/${key}`;
</script>
