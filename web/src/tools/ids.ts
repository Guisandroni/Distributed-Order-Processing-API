export function createProductId(name: string) {
  const normalizedName = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  return `${normalizedName}-${Date.now().toString().slice(-4)}`
}

export function createOrderId() {
  return `AUR-${Date.now().toString().slice(-6)}`
}
