import { env } from '../../config/env'
import { Icon } from '../common/Icon'

export function InstagramSection() {
  return (
    <section className="instagram-section section-width" aria-labelledby="instagram-title">
      <span className="eyebrow">Inspiração todos os dias</span>
      <h2 id="instagram-title">Siga nossa casa no Instagram</h2>
      <a href={env.instagramUrl} target="_blank" rel="noreferrer" aria-label="Instagram da Aura Casa"><Icon name="instagram" size={24} /> @auracasa</a>
    </section>
  )
}
