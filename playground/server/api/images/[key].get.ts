export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key')
  if (!key) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No key provided'
    })
  }

  const config = useRuntimeConfig()
  const publicUrl = `${config.public.s3PublicUrl}/${key}`

  return sendRedirect(event, publicUrl)
})