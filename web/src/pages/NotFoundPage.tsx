import { Link } from 'react-router-dom'
import { Icon } from '../components/common/Icon'

export function NotFoundPage() {
  return (
    <main className="not-found section-width">
      <span>404</span>
      <h1>Esta página não existe.</h1>
      <p>O endereço pode ter mudado ou não está mais disponível.</p>
      <Link className="primary-button" to="/">Voltar para o início <Icon name="arrow" size={17} /></Link>
    </main>
  )
}
