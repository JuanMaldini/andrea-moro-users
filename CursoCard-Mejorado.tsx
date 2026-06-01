'use client'
import React from 'react'
import Link from 'next/link'

interface CursoData {
    id: string
    name: string
    slug: string
    clases: number
    videos: number
    url: string
}

export const CursoCardMejorado = ({ curso }: { curso: CursoData }) => {
    const { id, name, slug, clases, videos, url } = curso

    return (
        <div className="w-full px-4 py-6">
            <div className="bg-vanilla border-2 border-grisoscuro rounded-lg overflow-hidden">
                {/* Sección de Título */}
                <div className="bg-grisclaro px-6 py-5 border-b-2 border-grisoscuro">
                    <Link
                        href={`/admin/cursos/${id}`}
                        className="text-2xl md:text-3xl font-bold text-marron hover:text-marroncalido transition"
                    >
                        {name}
                    </Link>
                </div>

                {/* Sección de Slug */}
                <div className="bg-gris200 px-6 py-4 border-b-2 border-grisoscuro">
                    <p className="text-lg md:text-xl text-grisclarito font-medium break-all">
                        {slug}
                    </p>
                </div>

                {/* Sección de Información */}
                <div className="px-6 py-6 bg-grisclaro">
                    <div className="flex flex-col gap-4 md:flex-row md:justify-around mb-6">
                        <div className="text-center">
                            <p className="text-lg md:text-2xl font-bold text-marron">
                                {clases}
                            </p>
                            <p className="text-base md:text-lg text-grisclarito font-medium">
                                clases
                            </p>
                        </div>
                        <div className="h-px md:h-auto md:w-px bg-grisoscuro"></div>
                        <div className="text-center">
                            <p className="text-lg md:text-2xl font-bold text-marron">
                                {videos}
                            </p>
                            <p className="text-base md:text-lg text-grisclarito font-medium">
                                videos
                            </p>
                        </div>
                    </div>
                </div>

                {/* Sección de Botones */}
                <div className="px-6 py-6 bg-vanilla border-t-2 border-grisoscuro">
                    <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                        <button
                            onClick={() => navigator.clipboard.writeText(url)}
                            className="px-6 py-3 md:py-4 text-base md:text-lg font-semibold border-2 border-marron text-marron hover:bg-marron hover:text-blanco hover:shadow-md transition duration-200 rounded"
                        >
                            Copiar
                        </button>

                        <a
                            href={`https://wa.me/543576483367?text=Interesado%20en%20${encodeURIComponent(name)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-6 py-3 md:py-4 text-base md:text-lg font-semibold border-2 border-marron text-marron hover:bg-marron hover:text-blanco hover:shadow-md transition duration-200 rounded"
                        >
                            WhatsApp
                        </a>

                        <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-6 py-3 md:py-4 text-base md:text-lg font-semibold border-2 border-marron text-marron hover:bg-marron hover:text-blanco hover:shadow-md transition duration-200 rounded"
                        >
                            Abrir
                        </a>
                    </div>
                </div>
            </div>
        </div>
    )
}
