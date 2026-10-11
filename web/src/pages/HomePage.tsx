import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { BenefitsSection } from '../components/home/BenefitsSection'
import { ClosingBanner } from '../components/home/ClosingBanner'
import { CollectionSection } from '../components/home/CollectionSection'
import { HeroSection } from '../components/home/HeroSection'
import { InstagramSection } from '../components/home/InstagramSection'
import { NewArrivalsSection } from '../components/home/NewArrivalsSection'
import { PlacesSection } from '../components/home/PlacesSection'
import { StorySection } from '../components/home/StorySection'

export function HomePage() {
  const location = useLocation()

  useEffect(() => {
    if (!location.hash) {
      window.scrollTo({ top: 0 })
      return
    }
    window.requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView())
  }, [location.hash])

  return (
    <main>
      <HeroSection />
      <NewArrivalsSection />
      <PlacesSection />
      <StorySection />
      <BenefitsSection />
      <InstagramSection />
      <CollectionSection />
      <ClosingBanner />
    </main>
  )
}
