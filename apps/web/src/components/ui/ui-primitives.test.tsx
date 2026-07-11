/**
 * @fileoverview Render smoke tests for the shadcn/ui primitives that the
 * dashboard composes. They mount every exported sub-component (className
 * passthrough, custom props, and the full Dialog/Tabs trees) so the design
 * system carries its own coverage instead of relying on incidental use by
 * page tests.
 *
 * @layer components/ui
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card.js'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog.js'
import { Input } from './input.js'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from './table.js'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs.js'

describe('ui primitives', () => {
  /**
   * The Card family renders every region, and the className passthrough
   * reaches the outer element so page-level layout overrides apply.
   */
  it('renders the full Card composition with a className passthrough', () => {
    render(
      <Card className="card-under-test">
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    )
    expect(screen.getByText('Title')).toBeInTheDocument()
    expect(screen.getByText('Footer')).toBeInTheDocument()
    expect(document.querySelector('.card-under-test')).not.toBeNull()
  })

  /**
   * The Input forwards its ref and arbitrary attributes to the native
   * element, which the forms across the dashboard depend on.
   */
  it('renders an Input that forwards value and type', () => {
    render(<Input type="number" defaultValue={7} aria-label="amount" />)
    const input = screen.getByLabelText('amount')
    expect(input).toHaveAttribute('type', 'number')
    expect(input).toHaveValue(7)
  })

  /**
   * The Table family renders header, body, footer, and caption together so
   * every structural sub-component is exercised.
   */
  it('renders a Table with header, body, footer and caption', () => {
    render(
      <Table>
        <TableCaption>Caption</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Column</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Total</TableCell>
          </TableRow>
        </TableFooter>
      </Table>,
    )
    expect(screen.getByText('Caption')).toBeInTheDocument()
    expect(screen.getByText('Column')).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
  })

  /**
   * The Tabs tree renders the list, triggers and the active panel, covering
   * the Radix wrappers the Playground and Usage pages use.
   */
  it('renders a Tabs tree with the default panel visible', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">First</TabsTrigger>
          <TabsTrigger value="b">Second</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel A</TabsContent>
        <TabsContent value="b">Panel B</TabsContent>
      </Tabs>,
    )
    expect(screen.getByRole('tab', { name: 'First' })).toBeInTheDocument()
    expect(screen.getByText('Panel A')).toBeInTheDocument()
  })

  /**
   * An open Dialog renders its overlay, content, and every labelled region,
   * covering the drawer/modal primitive the Ledger actions build on.
   */
  it('renders an open Dialog with all regions', () => {
    render(
      <Dialog open>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog title</DialogTitle>
            <DialogDescription>Dialog description</DialogDescription>
          </DialogHeader>
          <DialogFooter>Actions</DialogFooter>
        </DialogContent>
      </Dialog>,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Dialog title')).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()
  })
})
